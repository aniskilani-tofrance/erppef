import { describe, expect, it } from "vitest";
import { proposeGroupPlan } from "@/lib/engine/propose";
import type {
  EngineData,
  ProposalInput,
  RoomData,
  TrainerData,
} from "@/lib/engine/types";

const TZ = "Europe/Paris";

const fullWeek = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: "08:00",
  end: "18:00",
}));

function marie(overrides: Partial<TrainerData> = {}): TrainerData {
  return {
    id: "marie",
    firstName: "Marie",
    lastName: "",
    contractType: "salarie",
    hourlyCost: 26,
    weeklyHoursMax: 24,
    priority: 1,
    skills: ["FLE"],
    isActive: true,
    availabilities: fullWeek,
    absences: [],
    busy: [],
    currentGroupLevels: [],
    ...overrides,
  };
}

function riim(overrides: Partial<TrainerData> = {}): TrainerData {
  return {
    ...marie(),
    id: "riim",
    firstName: "Riim",
    hourlyCost: 28,
    weeklyHoursMax: 9,
    priority: 2,
    ...overrides,
  };
}

function vacataire(overrides: Partial<TrainerData> = {}): TrainerData {
  return {
    ...marie(),
    id: "vacataire",
    firstName: "Vacataire",
    lastName: "FLE",
    contractType: "vacataire",
    hourlyCost: 40,
    weeklyHoursMax: 20,
    priority: 100,
    ...overrides,
  };
}

const salle12: RoomData = {
  id: "salle12",
  name: "Salle 12",
  capacity: 12,
  isActive: true,
  unavailabilities: [],
  busy: [],
};
const salle13: RoomData = { ...salle12, id: "salle13", name: "Salle 13", capacity: 15 };

const input: ProposalInput = {
  programId: "pef-a1",
  totalHours: 60,
  level: "A1",
  requiredSkills: ["FLE"],
  defaultWeeklyHours: 15,
  startsOn: "2026-01-05", // lundi, aucune fermeture dans la fenêtre
};

function data(trainers: TrainerData[], rooms: RoomData[] = [salle12, salle13]): EngineData {
  return { trainers, rooms, closures: [], timezone: TZ };
}

describe("proposeGroupPlan", () => {
  it("choisit Marie (salariée la moins chère) et la plus petite salle suffisante", () => {
    const p = proposeGroupPlan(input, data([vacataire(), riim(), marie()]));

    expect(p.trainer?.trainerId).toBe("marie");
    expect(p.trainer?.projectedCost).toBe(60 * 26);
    expect(p.room?.roomId).toBe("salle12"); // 12 places suffisent, on préserve la 13
    expect(p.totals.hours).toBeCloseTo(60);
    // 15 h/sem sur un plafond de 24 h : pas de violation
    expect(p.trainer?.hardViolations).toEqual([]);
  });

  it("bascule sur Riim quand Marie sature son plafond hebdo, avec l'explication", () => {
    // Marie a déjà 12 h/sem planifiées les lundis-mardis 8h-14h sur toute la période
    const busy = [];
    for (let week = 0; week < 6; week++) {
      const monday = new Date(Date.UTC(2026, 0, 5 + week * 7));
      const tuesday = new Date(Date.UTC(2026, 0, 6 + week * 7));
      for (const d of [monday, tuesday]) {
        const day = d.toISOString().slice(0, 10);
        busy.push({ startsAt: `${day}T07:00:00.000Z`, endsAt: `${day}T13:00:00.000Z` });
      }
    }
    const p = proposeGroupPlan(
      { ...input, totalHours: 27, defaultWeeklyHours: 9 }, // 9 h/sem demandées
      data([marie({ busy }), riim(), vacataire()]),
    );

    // 12 h existantes + 9 h nouvelles = 21 h < 24 … sauf que les créneaux se CHEVAUCHENT
    // (lundi/mardi 9h-12h en plein dans ses séances 8h-14h) → conflit dur pour Marie.
    expect(p.trainer?.trainerId).toBe("riim");
    const marieRank = p.trainerAlternatives.find((t) => t.trainerId === "marie");
    expect(marieRank?.hardViolations.length).toBeGreaterThan(0);
  });

  it("finit par proposer le vacataire quand les salariées sont saturées", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 45, defaultWeeklyHours: 15 },
      data([
        marie({ weeklyHoursMax: 10 }), // plafond trop bas pour 15 h/sem
        riim(), // plafond 9 h < 15 h
        vacataire(),
      ]),
    );

    expect(p.trainer?.trainerId).toBe("vacataire");
    const marieRank = p.trainerAlternatives.find((t) => t.trainerId === "marie");
    expect(marieRank?.hardViolations.some((v) => v.includes("Plafond hebdo"))).toBe(true);
  });

  it("écarte un formateur absent sur la période", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 15 },
      data([
        marie({ absences: [{ startsOn: "2026-01-01", endsOn: "2026-01-31" }] }),
        riim({ weeklyHoursMax: 24 }),
      ]),
    );
    expect(p.trainer?.trainerId).toBe("riim");
  });

  it("respecte les indisponibilités récurrentes (pattern non couvert)", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 15 },
      data([
        marie({ availabilities: [{ weekday: 1, start: "09:00", end: "12:00" }] }), // lundi seulement
        vacataire(),
      ]),
    );
    expect(p.trainer?.trainerId).toBe("vacataire");
    const marieRank = p.trainerAlternatives.find((t) => t.trainerId === "marie");
    expect(marieRank?.hardViolations.some((v) => v.includes("Indisponible"))).toBe(true);
  });

  it("signale l'absence de solution : aucun formateur, warning explicite", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 15 },
      data([marie({ isActive: false })]),
    );
    expect(p.trainer).toBeNull();
    expect(p.warnings.some((w) => w.code === "no_trainer")).toBe(true);
  });

  it("écarte les salles trop petites ou occupées", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 15, expectedHeadcount: 14 },
      data([marie()], [salle12, salle13]),
    );
    expect(p.room?.roomId).toBe("salle13"); // 12 < 14 → salle 12 écartée
    const s12 = p.roomAlternatives.find((r) => r.roomId === "salle12");
    expect(s12?.hardViolations.some((v) => v.includes("Capacité"))).toBe(true);
  });

  it("privilégie la continuité pédagogique à coût égal", () => {
    const p = proposeGroupPlan(
      { ...input, totalHours: 15 },
      data([
        marie({ id: "m1", firstName: "M1", priority: 5 }),
        marie({ id: "m2", firstName: "M2", priority: 5, currentGroupLevels: ["A1"] }),
      ]),
    );
    expect(p.trainer?.trainerId).toBe("m2");
  });

  it("signale un créneau imposé hors horaires d'ouverture (9h-12h / 13h-20h)", () => {
    const p = proposeGroupPlan(
      {
        ...input,
        totalHours: 15,
        weeklyPattern: [
          { weekday: 1, start: "08:00", end: "11:00" }, // avant l'ouverture
          { weekday: 2, start: "11:00", end: "14:00" }, // à cheval sur la pause déjeuner
          { weekday: 3, start: "13:00", end: "16:00" }, // conforme
        ],
      },
      data([marie()]),
    );
    const w = p.warnings.find((x) => x.code === "outside_opening_hours");
    expect(w?.message).toContain("08:00-11:00");
    expect(w?.message).toContain("11:00-14:00");
    expect(w?.message).not.toContain("13:00-16:00");
  });

  it("skipSchoolHolidays=false : planifie pendant les vacances mais jamais les fériés", () => {
    const withClosures: EngineData = {
      ...data([marie()]),
      closures: [
        { startsOn: "2026-02-14", endsOn: "2026-03-01", label: "Hiver 2026 (zone C)", kind: "vacances_scolaires" },
        { startsOn: "2026-01-12", endsOn: "2026-01-12", label: "Fermeture exceptionnelle", kind: "fermeture_org" },
      ],
    };
    const holidayDates = (skip: boolean | undefined) =>
      proposeGroupPlan({ ...input, totalHours: 120, skipSchoolHolidays: skip }, withClosures)
        .sessions.map((s) => s.localDate);

    // Par défaut (undefined = true) : rien pendant les vacances d'hiver.
    expect(holidayDates(undefined).some((d) => d >= "2026-02-14" && d <= "2026-03-01")).toBe(false);

    // Option décochée : cours pendant les vacances, mais la fermeture org reste sautée.
    const dates = holidayDates(false);
    expect(dates.some((d) => d >= "2026-02-14" && d <= "2026-03-01")).toBe(true);
    expect(dates).not.toContain("2026-01-12");
  });
});

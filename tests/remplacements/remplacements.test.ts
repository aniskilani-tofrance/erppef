import { describe, expect, it } from "vitest";
import { rankReplacements } from "@/lib/engine/replacement";
import { replacementReason } from "@/lib/remplacements/load";
import { groupRelancesByTrainer, relanceEmail } from "@/lib/emargement/relances";
import type { EngineData, TrainerData } from "@/lib/engine/types";

const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" }));
function trainer(id: string, overrides: Partial<TrainerData> = {}): TrainerData {
  return {
    id, firstName: id, lastName: "", contractType: "salarie", hourlyCost: 20, weeklyHoursMax: 24, priority: 1,
    skills: [], isActive: true, availabilities: weekdays, absences: [], busy: [], currentGroupLevels: [],
    ...overrides,
  };
}
const data = (trainers: TrainerData[]): EngineData => ({ trainers, rooms: [], closures: [], timezone: "Europe/Paris" });

// Jeudi 15 octobre 2026, 10h-12h à Paris
const SESSION = { startsAt: "2026-10-15T08:00:00Z", endsAt: "2026-10-15T10:00:00Z", level: "A1", excludeTrainerId: "marie" };

describe("rankReplacements", () => {
  it("exclut la formatrice absente et classe salariée → vacataire → bénévole", () => {
    const ranked = rankReplacements(SESSION, data([
      trainer("marie"),
      trainer("benevole", { contractType: "benevole", hourlyCost: 0 }),
      trainer("sabrina", { contractType: "prestataire", hourlyCost: 30 }),
      trainer("mj"),
    ]));
    expect(ranked.map((r) => r.trainerId)).toEqual(["mj", "sabrina", "benevole"]);
    expect(ranked.every((r) => r.hardViolations.length === 0)).toBe(true);
  });

  it("écarte qui est indisponible, en congé, déjà en cours ou au plafond", () => {
    const ranked = rankReplacements(SESSION, data([
      trainer("lundi-seul", { availabilities: [{ weekday: 1, start: "09:00", end: "18:00" }] }),
      trainer("conge", { absences: [{ startsOn: "2026-10-14", endsOn: "2026-10-16" }] }),
      trainer("occupee", { busy: [{ startsAt: "2026-10-15T09:00:00Z", endsAt: "2026-10-15T11:00:00Z" }] }),
      trainer("plafond", { weeklyHoursMax: 1 }),
      trainer("libre"),
    ]));
    const eligible = ranked.filter((r) => r.hardViolations.length === 0).map((r) => r.trainerId);
    expect(eligible).toEqual(["libre"]);
    expect(ranked.find((r) => r.trainerId === "lundi-seul")!.hardViolations[0]).toContain("jeudi 10:00–12:00");
  });

  it("ne propose pas de formatrice inactive", () => {
    expect(rankReplacements(SESSION, data([trainer("partie", { isActive: false })]))).toEqual([]);
  });
});

describe("replacementReason", () => {
  const absences = [
    { trainer_id: "marie", starts_on: "2026-10-14", ends_on: "2026-10-16", status: "approuvee" },
    { trainer_id: "mj", starts_on: "2026-10-15", ends_on: "2026-10-15", status: "en_attente" },
  ];
  it("distingue absence validée, demande à valider, séance sans formateur et cas normal", () => {
    expect(replacementReason({ trainerId: "marie", startsAt: SESSION.startsAt }, absences)).toBe("absence");
    expect(replacementReason({ trainerId: "mj", startsAt: SESSION.startsAt }, absences)).toBe("absence_a_valider");
    expect(replacementReason({ trainerId: null, startsAt: SESSION.startsAt }, absences)).toBe("sans_formateur");
    expect(replacementReason({ trainerId: "sabrina", startsAt: SESSION.startsAt }, absences)).toBeNull();
    expect(replacementReason({ trainerId: "marie", startsAt: "2026-10-19T08:00:00Z" }, absences)).toBeNull();
  });
});

describe("relances d'émargement", () => {
  const sheets = [
    { id: "s1", starts_at: "2026-10-07T07:00:00Z", groups: { name: "A1 Cordon" }, trainers: { first_name: "Marie ", email: "marie@x.fr" } },
    { id: "s2", starts_at: "2026-10-07T12:00:00Z", groups: { name: "A2 Landy" }, trainers: { first_name: "Marie", email: "marie@x.fr" } },
    { id: "s3", starts_at: "2026-10-07T12:00:00Z", groups: { name: "Atelier" }, trainers: null },
  ];
  it("un email par formatrice, sans les séances sans formatrice joignable", () => {
    const grouped = groupRelancesByTrainer(sheets);
    expect([...grouped.keys()]).toEqual(["marie@x.fr"]);
    expect(grouped.get("marie@x.fr")!.lines).toHaveLength(2);
    expect(grouped.get("marie@x.fr")!.firstName).toBe("Marie");
  });
  it("le message du soir parle de la séance du jour, celui du matin reste générique", () => {
    expect(relanceEmail("soir", "Marie", ["x"]).subject).toBe("Ce soir : une feuille d'émargement à clôturer");
    expect(relanceEmail("soir", "Marie", ["x", "y"]).html).toContain("Vos séances d'aujourd'hui sont terminées");
    expect(relanceEmail("matin", "Marie", ["x"]).subject).toBe("Feuille d'émargement à clôturer");
  });
});

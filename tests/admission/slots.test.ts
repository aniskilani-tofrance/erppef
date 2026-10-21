import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLOT_RULES,
  blockRanges,
  expandClosedDates,
  freeSlots,
  groupSlotsByDay,
  isSlotFree,
  slotDayLabel,
  slotLabel,
  validateSlotRule,
  type SlotRule,
} from "@/lib/admission/slots";

// Lundi 19 octobre 2026, 8h00 à Paris (UTC+2, heure d'été jusqu'au 25 octobre).
const MONDAY_8H = new Date("2026-10-19T06:00:00.000Z");

describe("créneaux d'admission — réglage par défaut", () => {
  it("mardi et jeudi, 10h-12h et 14h-16h, 30 min, sur 14 jours", () => {
    const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], MONDAY_8H);
    // 20, 22, 27 et 29 octobre × 8 créneaux
    expect(slots).toHaveLength(32);
    expect([...new Set(slots.map((s) => s.date))]).toEqual(["2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"]);
    expect(slots.filter((s) => s.date === "2026-10-20").map((s) => s.time)).toEqual([
      "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30",
    ]);
    expect(slots.every((s) => s.minutes === 30)).toBe(true);
  });

  it("heure d'été puis heure d'hiver : 10h00 à Paris = 08:00 UTC puis 09:00 UTC", () => {
    const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], MONDAY_8H);
    const tue20 = slots.find((s) => s.date === "2026-10-20" && s.time === "10:00")!;
    expect(tue20.startsAt).toBe("2026-10-20T08:00:00.000Z");
    expect(tue20.endsAt).toBe("2026-10-20T08:30:00.000Z");
    const tue27 = slots.find((s) => s.date === "2026-10-27" && s.time === "10:00")!;
    expect(tue27.startsAt).toBe("2026-10-27T09:00:00.000Z");
  });

  it("passage à l'heure d'été (28 mars 2027) : 10h00 = 09:00 UTC puis 08:00 UTC", () => {
    const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], new Date("2027-03-22T07:00:00.000Z"));
    expect(slots.find((s) => s.date === "2027-03-23" && s.time === "10:00")?.startsAt).toBe("2027-03-23T09:00:00.000Z");
    expect(slots.find((s) => s.date === "2027-03-30" && s.time === "10:00")?.startsAt).toBe("2027-03-30T08:00:00.000Z");
  });
});

describe("créneaux d'admission — exclusions", () => {
  it("délai minimal de 2 h : mardi 9h30, premier créneau 11h30", () => {
    const now = new Date("2026-10-20T07:30:00.000Z"); // 9h30 à Paris
    const today = freeSlots(DEFAULT_SLOT_RULES, [], [], now).filter((s) => s.date === "2026-10-20");
    expect(today.map((s) => s.time)).toEqual(["11:30", "14:00", "14:30", "15:00", "15:30"]);
  });

  it("horizon : rien au-delà de 14 jours, aujourd'hui compris", () => {
    const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], MONDAY_8H, { horizonDays: 3 });
    expect([...new Set(slots.map((s) => s.date))]).toEqual(["2026-10-20"]);
  });

  it("un RDV prévu retire les créneaux qu'il chevauche ; annulé ou honoré, rien", () => {
    const appointments = [
      { startsAt: "2026-10-20T08:15:00.000Z", endsAt: "2026-10-20T08:45:00.000Z", status: "prevu" }, // 10h15-10h45
      { startsAt: "2026-10-20T12:00:00.000Z", endsAt: "2026-10-20T12:30:00.000Z", status: "annule" }, // 14h00
      { startsAt: "2026-10-20T12:30:00.000Z", endsAt: "2026-10-20T13:00:00.000Z", status: "honore" }, // 14h30
    ];
    const tue = freeSlots(DEFAULT_SLOT_RULES, [], appointments, MONDAY_8H).filter((s) => s.date === "2026-10-20");
    expect(tue.map((s) => s.time)).toEqual(["11:00", "11:30", "14:00", "14:30", "15:00", "15:30"]);
  });

  it("un RDV qui finit pile au début d'un créneau ne le bloque pas", () => {
    const appointments = [{ startsAt: "2026-10-20T07:30:00.000Z", endsAt: "2026-10-20T08:00:00.000Z" }]; // 9h30-10h00
    const tue = freeSlots(DEFAULT_SLOT_RULES, [], appointments, MONDAY_8H).filter((s) => s.date === "2026-10-20");
    expect(tue[0].time).toBe("10:00");
  });

  it("période bloquée : jeudi matin", () => {
    const blocks = blockRanges("2026-10-22", "2026-10-22", "matin");
    const thu = freeSlots(DEFAULT_SLOT_RULES, blocks, [], MONDAY_8H).filter((s) => s.date === "2026-10-22");
    expect(thu.map((s) => s.time)).toEqual(["14:00", "14:30", "15:00", "15:30"]);
  });

  it("jours fermés (férié, fermeture) : aucun créneau", () => {
    const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], MONDAY_8H, { closedDates: ["2026-10-22"] });
    expect(slots.some((s) => s.date === "2026-10-22")).toBe(false);
    expect(slots).toHaveLength(24);
  });

  it("plage suspendue ignorée ; plages qui se recouvrent sans doublon", () => {
    const rules: SlotRule[] = [
      { weekday: 2, startTime: "10:00", endTime: "11:00", slotMinutes: 30, isActive: true },
      { weekday: 2, startTime: "10:00", endTime: "11:00", slotMinutes: 30, isActive: true },
      { weekday: 4, startTime: "10:00", endTime: "11:00", slotMinutes: 30, isActive: false },
    ];
    const slots = freeSlots(rules, [], [], MONDAY_8H, { horizonDays: 7 });
    expect(slots.map((s) => `${s.date} ${s.time}`)).toEqual(["2026-10-20 10:00", "2026-10-20 10:30"]);
  });

  it("une plage trop courte pour un dernier créneau entier s'arrête avant", () => {
    const rules: SlotRule[] = [{ weekday: 2, startTime: "10:00", endTime: "11:10", slotMinutes: 30 }];
    expect(freeSlots(rules, [], [], MONDAY_8H, { horizonDays: 7 }).map((s) => s.time)).toEqual(["10:00", "10:30"]);
  });
});

describe("créneaux d'admission — vérification et libellés", () => {
  const slots = freeSlots(DEFAULT_SLOT_RULES, [], [], MONDAY_8H);

  it("isSlotFree : même début et même durée", () => {
    expect(isSlotFree(slots, "2026-10-20T08:00:00.000Z", 30)).toBe(true);
    expect(isSlotFree(slots, "2026-10-20T08:00:00.000Z", 45)).toBe(false);
    expect(isSlotFree(slots, "2026-10-20T08:10:00.000Z", 30)).toBe(false);
  });

  it("libellés courts", () => {
    expect(slotLabel(slots[0])).toBe("Mar. 20 · 10h00");
    expect(slotDayLabel("2026-10-22")).toBe("Jeu. 22 oct.");
    expect(slotDayLabel("2027-08-02")).toBe("Lun. 2 août");
  });

  it("groupement par jour", () => {
    const groups = groupSlotsByDay(slots);
    expect(groups.map((g) => g.label)).toEqual(["Mar. 20 oct.", "Jeu. 22 oct.", "Mar. 27 oct.", "Jeu. 29 oct."]);
    expect(groups[0].slots).toHaveLength(8);
  });
});

describe("créneaux d'admission — utilitaires", () => {
  it("expandClosedDates : intervalles inclusifs, bornés à la fenêtre", () => {
    expect(
      expandClosedDates(
        [
          { startsOn: "2026-10-18", endsOn: "2026-10-20" },
          { startsOn: "2026-11-01", endsOn: "2026-11-01" },
          { startsOn: "2026-12-25", endsOn: "2026-12-25" },
        ],
        "2026-10-19",
        "2026-11-02",
      ),
    ).toEqual(["2026-10-19", "2026-10-20", "2026-11-01"]);
  });

  it("blockRanges : journée continue, demi-journées jour par jour (heure de Paris)", () => {
    expect(blockRanges("2026-10-20", "2026-10-21", "journee")).toEqual([
      { startsAt: "2026-10-19T22:00:00.000Z", endsAt: "2026-10-21T22:00:00.000Z" },
    ]);
    expect(blockRanges("2026-10-24", "2026-10-26", "apres_midi")).toEqual([
      { startsAt: "2026-10-24T11:00:00.000Z", endsAt: "2026-10-24T22:00:00.000Z" },
      { startsAt: "2026-10-25T12:00:00.000Z", endsAt: "2026-10-25T23:00:00.000Z" },
      { startsAt: "2026-10-26T12:00:00.000Z", endsAt: "2026-10-26T23:00:00.000Z" },
    ]);
  });

  it("validateSlotRule", () => {
    expect(validateSlotRule({ weekday: 2, startTime: "10:00", endTime: "12:00", slotMinutes: 30 })).toBeNull();
    expect(validateSlotRule({ weekday: 2, startTime: "12:00", endTime: "10:00", slotMinutes: 30 })).toMatch(/fin/);
    expect(validateSlotRule({ weekday: 2, startTime: "10:00", endTime: "10:20", slotMinutes: 30 })).toMatch(/30 min/);
    expect(validateSlotRule({ weekday: 8, startTime: "10:00", endTime: "12:00", slotMinutes: 30 })).toBe("Jour invalide");
  });
});

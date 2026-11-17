import { describe, expect, it } from "vitest";
import {
  daysUntil, deadlineFromInput, endOfMonth, endOfWeek, inputFromDeadline, matchesDeadlineFilter, monthGrid, monthsFrom,
  relativeLabel, shiftMonth, timeline, urgencyOf,
} from "@/lib/financements/echeances";

// Lundi 17 novembre 2026, 9 h à Paris (8 h UTC).
const NOW = new Date("2026-11-17T08:00:00Z");

describe("Financements — calcul des jours (heure de Paris)", () => {
  it("compte en jours calendaires de Paris, pas en tranches de 24 h", () => {
    expect(daysUntil("2026-11-17T22:59:00Z", NOW)).toBe(0); // 23h59 à Paris, le jour même
    expect(daysUntil("2026-11-17T23:30:00Z", NOW)).toBe(1); // 0h30 le 18 à Paris
    expect(daysUntil("2026-12-01T22:59:00Z", NOW)).toBe(14);
    expect(daysUntil("2026-11-16T22:59:00Z", NOW)).toBe(-1);
  });

  it("traverse le passage à l'heure d'été sans décalage", () => {
    const now = new Date("2027-03-27T10:00:00Z");
    expect(daysUntil("2027-03-29T21:59:00Z", now)).toBe(2); // 23h59 heure d'été
  });

  it("libellés relatifs", () => {
    expect(relativeLabel(0)).toBe("aujourd'hui");
    expect(relativeLabel(1)).toBe("demain");
    expect(relativeLabel(-3)).toBe("il y a 3 jours");
    expect(relativeLabel(12)).toBe("dans 12 jours");
  });
});

describe("Financements — couleurs d'urgence de la frise", () => {
  it("rouge à moins de 15 jours, orange à moins de 30, vert au-delà, retard si dépassé", () => {
    expect(urgencyOf(-1)).toBe("retard");
    expect(urgencyOf(0)).toBe("rouge");
    expect(urgencyOf(14)).toBe("rouge");
    expect(urgencyOf(15)).toBe("orange");
    expect(urgencyOf(29)).toBe("orange");
    expect(urgencyOf(30)).toBe("vert");
    expect(urgencyOf(120)).toBe("vert");
  });

  it("la frise garde les 30 prochains jours non faits et le retard, triés par date", () => {
    const base = { kind: "depot" as const, title: "x" };
    const rows = [
      { ...base, id: "loin", due_at: "2027-01-04T22:59:00Z", done_at: null },
      { ...base, id: "fait", due_at: "2026-11-20T22:59:00Z", done_at: "2026-11-10T10:00:00Z" },
      { ...base, id: "retard", due_at: "2026-11-13T22:59:00Z", done_at: null },
      { ...base, id: "j14", due_at: "2026-12-01T22:59:00Z", done_at: null },
      { ...base, id: "j28", due_at: "2026-12-15T22:59:00Z", done_at: null },
    ];
    const t = timeline(rows, NOW);
    expect(t.map((d) => d.id)).toEqual(["retard", "j14", "j28"]);
    expect(t.map((d) => d.urgency)).toEqual(["retard", "rouge", "orange"]);
  });
});

describe("Financements — saisie d'une date limite", () => {
  it("sans heure : 23h59 à Paris (heure d'hiver)", () => {
    expect(deadlineFromInput("2026-12-01")).toBe("2026-12-01T22:59:00.000Z");
  });
  it("avec heure, en heure d'été", () => {
    expect(deadlineFromInput("2027-06-30", "18:00")).toBe("2027-06-30T16:00:00.000Z");
  });
  it("vide → pas de date ; format faux → erreur", () => {
    expect(deadlineFromInput("")).toBeNull();
    expect(deadlineFromInput(null)).toBeNull();
    expect(() => deadlineFromInput("01/12/2026")).toThrow();
    expect(() => deadlineFromInput("2026-12-01", "25:00")).toThrow();
  });
  it("aller-retour vers le formulaire", () => {
    expect(inputFromDeadline("2026-12-01T22:59:00Z")).toEqual({ day: "2026-12-01", time: "23:59" });
    expect(inputFromDeadline(null)).toEqual({ day: "", time: "" });
  });
});

describe("Financements — filtre « échéance » de la veille", () => {
  it("bornes de semaine et de mois", () => {
    expect(endOfWeek("2026-11-17")).toBe("2026-11-22");
    expect(endOfMonth("2026-11-17")).toBe("2026-11-30");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });
  it("cette semaine, ce mois-ci, plus tard, sans date, passée", () => {
    expect(matchesDeadlineFilter("semaine", "2026-11-22T22:59:00Z", NOW)).toBe(true);
    expect(matchesDeadlineFilter("semaine", "2026-11-23T22:59:00Z", NOW)).toBe(false);
    expect(matchesDeadlineFilter("mois", "2026-11-23T22:59:00Z", NOW)).toBe(true);
    expect(matchesDeadlineFilter("mois", "2026-12-01T22:59:00Z", NOW)).toBe(false);
    expect(matchesDeadlineFilter("plus_tard", "2026-12-01T22:59:00Z", NOW)).toBe(true);
    expect(matchesDeadlineFilter("sans_date", null, NOW)).toBe(true);
    expect(matchesDeadlineFilter("sans_date", "2026-12-01T22:59:00Z", NOW)).toBe(false);
    expect(matchesDeadlineFilter("passee", "2026-11-13T22:59:00Z", NOW)).toBe(true);
    expect(matchesDeadlineFilter("mois", "2026-11-13T22:59:00Z", NOW)).toBe(false);
  });
});

describe("Financements — calendrier", () => {
  it("grille du mois du lundi au dimanche", () => {
    const g = monthGrid("2026-11");
    expect(g[0][0]).toBe("2026-10-26");
    expect(g.at(-1)![6]).toBe("2026-12-06");
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("6 mois à partir du mois courant, et navigation", () => {
    expect(monthsFrom("2026-11-17", 6)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
});

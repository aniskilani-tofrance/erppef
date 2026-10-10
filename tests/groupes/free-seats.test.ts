import { describe, expect, it } from "vitest";
import { freeSeats, levelMatches, matchSeatCandidates, slotsOverlap } from "@/lib/groupes/free-seats";

const lunMar = [
  { weekday: 1, start: "09:00", end: "12:00" },
  { weekday: 2, start: "09:00", end: "12:00" },
];

describe("places libérées", () => {
  it("compte les places libres à partir de la capacité", () => {
    expect(freeSeats(12, 10)).toBe(2);
    expect(freeSeats(12, 12)).toBe(0);
    expect(freeSeats(12, 14)).toBe(0);
    expect(freeSeats(null, 3)).toBe(0);
  });

  it("détecte un chevauchement de créneaux hebdo", () => {
    expect(slotsOverlap(lunMar, [{ weekday: 1, start: "11:00", end: "13:00" }])).toBe(true);
    expect(slotsOverlap(lunMar, [{ weekday: 1, start: "12:00", end: "15:00" }])).toBe(false);
    expect(slotsOverlap(lunMar, [{ weekday: 3, start: "09:00", end: "12:00" }])).toBe(false);
  });

  it("applique la règle de niveau du sélecteur d'inscription", () => {
    expect(levelMatches("A1", "A1")).toBe(true);
    expect(levelMatches("Alpha avancé", "Alpha")).toBe(true);
    // Sans niveau évalué (ou sans niveau d'entrée), on ne propose pas : la coordination décide à la main
    expect(levelMatches(null, "A1")).toBe(false);
    expect(levelMatches("A1", null)).toBe(false);
    expect(levelMatches("B1", "A1")).toBe(false);
  });

  it("ne garde que liste d'attente / évalués, au bon niveau, sans chevauchement", () => {
    const out = matchSeatCandidates(
      { entryLevel: "A2", pattern: lunMar },
      [
        { id: "ok-attente", status: "liste_attente", level: "A2", currentPatterns: [] },
        { id: "ok-evalue", status: "evalue", level: "A2", currentPatterns: [[{ weekday: 4, start: "13:00", end: "17:00" }]] },
        { id: "sans-niveau", status: "evalue", level: null, currentPatterns: [] },
        { id: "deja-inscrit", status: "inscrit", level: "A2", currentPatterns: [] },
        { id: "mauvais-niveau", status: "liste_attente", level: "B1", currentPatterns: [] },
        { id: "chevauche", status: "liste_attente", level: "A2", currentPatterns: [[{ weekday: 2, start: "10:00", end: "11:00" }]] },
        { id: "nouveau", status: "nouveau", level: "A2", currentPatterns: [] },
      ],
    );
    expect(out.map((c) => c.id)).toEqual(["ok-attente", "ok-evalue"]);
  });
});

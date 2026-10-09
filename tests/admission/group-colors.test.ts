import { describe, expect, it } from "vitest";
import { PALETTE, groupColor, groupsByLearner, hashColor } from "@/lib/admission/group-colors";

describe("couleur des groupes (pastille groupe)", () => {
  it("prend la couleur de la formatrice, sinon une couleur de secours stable par identifiant", () => {
    expect(groupColor({ id: "g1", trainerColor: "#0ea5e9" })).toBe("#0ea5e9");
    expect(groupColor({ id: "g1", trainerColor: null })).toBe(hashColor("g1"));
    expect(groupColor({ id: "g1", trainerColor: "rouge" })).toBe(hashColor("g1"));
    expect(hashColor("g1")).toBe(hashColor("g1"));
    expect(PALETTE).toContain(hashColor("n-importe-quoi"));
  });

  it("regroupe les inscriptions actives par apprenant, sans doublon, triées par nom", () => {
    const rows = [
      { learner_id: "a", group_id: "g2", status: "inscrit", groups: { name: "PEF A2 — 2026-27", trainers: { color: "#14b8a6" } } },
      { learner_id: "a", group_id: "g1", status: "inscrit", groups: { name: "Atelier lecture", trainers: null } },
      { learner_id: "a", group_id: "g1", status: "inscrit", groups: { name: "Atelier lecture", trainers: null } },
      { learner_id: "b", group_id: "g2", status: "abandon", groups: { name: "PEF A2 — 2026-27", trainers: { color: "#14b8a6" } } },
      { learner_id: "c", group_id: "g9", status: "inscrit", groups: null },
    ];
    const m = groupsByLearner(rows);
    expect(m.get("a")?.map((g) => g.name)).toEqual(["Atelier lecture", "PEF A2 — 2026-27"]);
    expect(m.get("a")?.[1].color).toBe("#14b8a6");
    expect(m.get("a")?.[0].color).toBe(hashColor("g1"));
    expect(m.has("b")).toBe(false); // abandon = plus inscrit
    expect(m.has("c")).toBe(false); // groupe inconnu
  });
});

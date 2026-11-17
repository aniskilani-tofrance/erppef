import { describe, expect, it } from "vitest";
import { STAGES } from "@/lib/financements/constants";
import { canMoveStage, isActiveStage, moveError, STAGE_TRANSITIONS, stagePatch } from "@/lib/financements/stages";

describe("Financements — transitions de statut des dossiers", () => {
  it("chemin nominal : on y va → rédaction → déposé → accordé → bilan rendu", () => {
    expect(canMoveStage("on_y_va", "en_redaction")).toBe(true);
    expect(canMoveStage("en_redaction", "depose")).toBe(true);
    expect(canMoveStage("depose", "accorde")).toBe(true);
    expect(canMoveStage("accorde", "bilan_rendu")).toBe(true);
  });

  it("refus, abandon, retour d'un cran pour corriger", () => {
    expect(canMoveStage("depose", "refuse")).toBe(true);
    expect(canMoveStage("en_redaction", "abandonne")).toBe(true);
    expect(canMoveStage("depose", "en_redaction")).toBe(true);
    expect(canMoveStage("abandonne", "on_y_va")).toBe(true);
  });

  it("sauts interdits, avec un message qui dit quoi faire", () => {
    expect(canMoveStage("on_y_va", "accorde")).toBe(false);
    expect(canMoveStage("bilan_rendu", "refuse")).toBe(false);
    expect(canMoveStage("refuse", "accorde")).toBe(false);
    expect(moveError("on_y_va", "accorde")).toContain("Passage impossible");
    expect(moveError("on_y_va", "accorde")).toContain("En rédaction");
    expect(moveError("depose", "depose")).toContain("déjà");
    expect(moveError("depose", "accorde")).toBeNull();
  });

  it("chaque statut a au moins une sortie, jamais vers lui-même, toujours vers un statut connu", () => {
    for (const s of STAGES) {
      expect(STAGE_TRANSITIONS[s].length).toBeGreaterThan(0);
      expect(STAGE_TRANSITIONS[s]).not.toContain(s);
      for (const t of STAGE_TRANSITIONS[s]) expect(STAGES).toContain(t);
    }
  });

  it("accorder pose la date d'accord ; revenir en arrière la retire", () => {
    expect(stagePatch("accorde", "2026-11-17", { granted_on: null })).toEqual({ stage: "accorde", granted_on: "2026-11-17" });
    expect(stagePatch("accorde", "2026-11-17", { granted_on: "2026-10-21" })).toEqual({ stage: "accorde" });
    expect(stagePatch("depose", "2026-11-17", { granted_on: "2026-10-21" })).toEqual({ stage: "depose", granted_on: null });
    expect(stagePatch("bilan_rendu", "2026-11-17", { granted_on: "2026-10-21" })).toEqual({ stage: "bilan_rendu" });
  });

  it("dossiers « en cours » (prochaines étapes)", () => {
    expect(isActiveStage("en_redaction")).toBe(true);
    expect(isActiveStage("accorde")).toBe(false);
  });
});

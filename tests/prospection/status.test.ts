import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, isOpenProspect, nextWorkingDay, transitionFor } from "@/lib/prospection/status";
import { manualOnlyLead } from "@/lib/leads/templates";
import { sourceFromText } from "@/lib/leads/csv";

// Vendredi 16 octobre 2026.
const FRIDAY = "2026-10-16";

describe("prospection : résultat d'un appel", () => {
  it("réessaie un « pas joint » le jour ouvré suivant, puis arrête après le dernier essai", () => {
    expect(nextWorkingDay(FRIDAY)).toBe("2026-10-19");
    expect(transitionFor("pas_de_reponse", 1, FRIDAY)).toEqual({ status: "pas_joint", callbackOn: "2026-10-19", createsLead: false });
    expect(transitionFor("pas_de_reponse", MAX_ATTEMPTS, FRIDAY).status).toBe("injoignable");
  });

  it("garde la date de rappel choisie, ou propose le jour ouvré suivant", () => {
    expect(transitionFor("rappeler", 1, FRIDAY, "2026-10-22").callbackOn).toBe("2026-10-22");
    expect(transitionFor("barrage", 1, FRIDAY).callbackOn).toBe("2026-10-19");
  });

  it("ne crée un lead que si le restaurateur est intéressé", () => {
    expect(transitionFor("interesse", 1, FRIDAY).createsLead).toBe(true);
    for (const o of ["pas_de_reponse", "barrage", "rappeler", "pas_de_besoin", "numero_faux", "ne_plus_appeler"] as const) {
      expect(transitionFor(o, 1, FRIDAY).createsLead).toBe(false);
    }
  });

  it("sort de la file les statuts définitifs", () => {
    expect(isOpenProspect("a_appeler")).toBe(true);
    expect(isOpenProspect("rappeler")).toBe(true);
    for (const s of ["interesse", "pas_de_besoin", "injoignable", "ne_plus_appeler", "hors_service"]) expect(isOpenProspect(s)).toBe(false);
  });

  it("un lead issu de la prospection ne reçoit aucun message automatique", () => {
    expect(manualOnlyLead({ source: "prospection" })).toBe(true);
    expect(sourceFromText("Prospection (appel à froid)")).toBe("prospection");
    expect(sourceFromText("Appel entrant")).toBe("appel_entrant");
  });
});

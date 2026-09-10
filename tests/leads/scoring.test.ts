import { describe, expect, it } from "vitest";
import { suggestScore } from "@/lib/leads/scoring";
import { suggestedLeadStatus } from "@/lib/leads/status";

describe("score suggéré (playbook v4)", () => {
  it("chaud = poste ferme + échéance < 3 mois + contrat éligible + décideur", () => {
    expect(suggestScore({ positionsCount: 2, hiringHorizon: "1_3m", contractType: "cdi", decisionMaker: true })).toBe("chaud");
    expect(suggestScore({ positionsCount: 1, hiringHorizon: "lt_1m", contractType: "saisonnier_4m", decisionMaker: true })).toBe("chaud");
  });
  it("tiède = besoin réel mais un critère à vérifier", () => {
    expect(suggestScore({ positionsCount: 2, hiringHorizon: "3_6m", contractType: "cdi", decisionMaker: true })).toBe("tiede");
    expect(suggestScore({ positionsCount: 2, hiringHorizon: "1_3m", contractType: "inconnu", decisionMaker: true })).toBe("tiede");
    expect(suggestScore({ positionsCount: 2, hiringHorizon: "1_3m", contractType: "cdi", decisionMaker: false })).toBe("tiede");
  });
  it("froid = extras seulement, pas de poste, ou rien de connu", () => {
    expect(suggestScore({ positionsCount: 3, hiringHorizon: "lt_1m", contractType: "extras", decisionMaker: true })).toBe("froid");
    expect(suggestScore({ positionsCount: 0, hiringHorizon: "lt_1m", contractType: "cdi", decisionMaker: true })).toBe("froid");
    expect(suggestScore({ positionsCount: 1, hiringHorizon: "inconnu", contractType: "inconnu", decisionMaker: null })).toBe("froid");
  });
});

describe("statut suggéré après un contact : jamais de recul", () => {
  it("messagerie sur un nouveau → à rappeler ; sur un qualifié → reste qualifié", () => {
    expect(suggestedLeadStatus("messagerie", "nouveau")).toBe("a_rappeler");
    expect(suggestedLeadStatus("messagerie", "qualifie")).toBe("qualifie");
  });
  it("joint → contacté ; RDV posé → rdv pris ; refus → perdu même depuis qualifié", () => {
    expect(suggestedLeadStatus("joint", "a_rappeler")).toBe("contacte");
    expect(suggestedLeadStatus("rdv_pose", "contacte")).toBe("rdv_pris");
    expect(suggestedLeadStatus("refus", "qualifie")).toBe("perdu");
  });
  it("un statut final ne bouge plus", () => {
    expect(suggestedLeadStatus("joint", "gagne")).toBe("gagne");
  });
});

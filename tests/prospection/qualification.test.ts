import { describe, expect, it } from "vitest";
import { qualifiedLeadStatus } from "@/lib/prospection/qualification";

describe("prospection : statut du lead créé par « Intéressé »", () => {
  it("est « Qualifié » quand postes, contrat et échéance sont connus", () => {
    expect(qualifiedLeadStatus({ positionsCount: 2, contractType: "cdi", hiringHorizon: "lt_1m" })).toBe("qualifie");
  });
  it("reste « Contacté » tant qu'il manque une réponse", () => {
    expect(qualifiedLeadStatus({ positionsCount: 1, contractType: "inconnu", hiringHorizon: "lt_1m" })).toBe("contacte");
    expect(qualifiedLeadStatus({ positionsCount: 0, contractType: "cdi", hiringHorizon: "1_3m" })).toBe("contacte");
    expect(qualifiedLeadStatus({ positionsCount: 1, contractType: "cdi", hiringHorizon: "inconnu" })).toBe("contacte");
  });
});

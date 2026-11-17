import { describe, expect, it } from "vitest";
import { applicationFromOpportunity, cleanContacts, computeCounters, funderCodeFromName } from "@/lib/financements/regles";
import { deadlineHref, formatAmountRange, formatEuros } from "@/lib/financements/liens";

describe("Financements — compteurs de « Ma semaine »", () => {
  it("en rédaction, déposés, accordés et montant de l'année", () => {
    const c = computeCounters(
      [
        { stage: "en_redaction", amount_granted: null, granted_on: null, created_at: "2026-11-01T10:00:00Z" },
        { stage: "en_redaction", amount_granted: null, granted_on: null, created_at: "2026-11-01T10:00:00Z" },
        { stage: "depose", amount_granted: null, granted_on: null, created_at: "2026-11-01T10:00:00Z" },
        { stage: "accorde", amount_granted: "3000", granted_on: "2026-10-21", created_at: "2026-11-17T10:00:00Z" },
        { stage: "bilan_rendu", amount_granted: 65000, granted_on: null, created_at: "2026-11-17T10:00:00Z" }, // reprise sans date d'acte
        { stage: "accorde", amount_granted: 9000, granted_on: "2025-06-01", created_at: "2025-06-01T10:00:00Z" },
        { stage: "refuse", amount_granted: null, granted_on: null, created_at: "2026-11-01T10:00:00Z" },
      ],
      2026,
    );
    expect(c).toEqual({ enRedaction: 2, deposes: 1, accordesAnnee: 2, montantAccordeAnnee: 68000 });
  });
});

describe("Financements — « Créer le dossier » sans ressaisie", () => {
  it("reprend titre, financeur, date limite, montant, lien et résumé de l'opportunité", () => {
    const row = applicationFromOpportunity(
      {
        id: "opp", org_id: "org", title: "Saison Multitude 2027-2028", family: "aap", funder_id: "f1",
        url: "https://multitude.example/aap", deadline_at: "2027-01-04T22:59:00Z", amount_min: null, amount_max: "10000",
        summary: "Événements interculturels.", eligibility_notes: "Structures déjà soutenues non prioritaires.",
      },
      { funderId: "f1", funderPortal: "sub_cd93", ownerId: "u1", createdBy: "u1" },
    );
    expect(row).toMatchObject({
      org_id: "org", opportunity_id: "opp", funder_id: "f1", title: "Saison Multitude 2027-2028", stage: "on_y_va",
      owner_id: "u1", deadline_at: "2027-01-04T22:59:00Z", amount_requested: 10000, portal: "sub_cd93",
    });
    expect(row.notes).toContain("Événements interculturels.");
    expect(row.notes).toContain("non prioritaires");
    expect(row.notes).toContain("https://multitude.example/aap");
  });
});

describe("Financements — financeurs", () => {
  it("code court, sans accents, unique dans l'organisation", () => {
    expect(funderCodeFromName("Fondation RAJA-Danièle Marcovici")).toBe("FONDATION-RAJA-DANIELE");
    expect(funderCodeFromName("Fondation Crédit Mutuel", ["FONDATION-CREDIT-MUTUEL"])).toBe("FONDATION-CREDIT-MUTUEL-2");
    expect(funderCodeFromName("  ")).toBe("FINANCEUR");
  });
  it("contacts : seuls nom, fonction, courriel, téléphone (texte) sont gardés", () => {
    expect(cleanContacts([{ fonction: " Service DPIJ ", courriel: "x@gouv.fr", note_perso: "à ne pas garder" }, {}, "texte", null])).toEqual([
      { fonction: "Service DPIJ", courriel: "x@gouv.fr" },
    ]);
    expect(cleanContacts("pas un tableau")).toEqual([]);
  });
});

describe("Financements — affichage", () => {
  it("montants en euros, plages", () => {
    expect(formatEuros(3000).replace(/\s/g, " ")).toBe("3 000 €");
    expect(formatEuros(null)).toBe("—");
    expect(formatAmountRange(5000, 50000)?.replace(/\s/g, " ")).toBe("5 000 € à 50 000 €");
    expect(formatAmountRange(null, 10000)?.replace(/\s/g, " ")).toBe("jusqu'à 10 000 €");
    expect(formatAmountRange(3000, null)?.replace(/\s/g, " ")).toBe("à partir de 3 000 €");
    expect(formatAmountRange(null, null)).toBeNull();
  });
  it("un clic sur une échéance ouvre le dossier, sinon l'opportunité, sinon le financeur", () => {
    expect(deadlineHref({ application_id: "a", opportunity_id: "o", funder_id: "f" })).toBe("/financements/dossiers/a");
    expect(deadlineHref({ application_id: null, opportunity_id: "o", funder_id: "f" })).toBe("/financements/veille/o");
    expect(deadlineHref({ application_id: null, opportunity_id: null, funder_id: "f" })).toBe("/financements/financeurs/f");
  });
});

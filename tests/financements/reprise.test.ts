import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acteDate, missingEnrichment, planImport, sameDepositDay } from "@/lib/financements/reprise";

// Fichier réel du bureau Financements (hors dépôt) : testé s'il est présent sur la machine.
const REAL = "/home/anis/agences/asso-pef/travaux/module-financements-erp/reprise-lot-1.json";

const fixture = {
  version: 1,
  financeurs: [
    { code: "PREF93-PV", name: "Préfecture 93", kind: "etat", portal: "dauphin", contacts: [{ fonction: "Mission Ville", courriel: "mv@example.gouv.fr" }] },
    { code: "CD93", name: "Département 93", kind: "departement", portal: "sub_cd93", contacts: [] },
  ],
  opportunites: [
    { dedupe_key: "pdv-2027", family: "aap", title: "Politique de la ville 2027", funder_code: "PREF93-PV", deadline_at: "2026-12-01T23:59:00+01:00", watch_status: "retenu", summary: "x" },
    { dedupe_key: "raja-2026", family: "mecenat", title: "Fondation RAJA", funder_name: "Fondation RAJA", deadline_at: "2026-11-13T23:59:00+01:00", watch_status: "a_surveiller", a_confirmer: "dépôt fait ou non" },
    { dedupe_key: "dilcrah", family: "aap", title: "DILCRAH", funder_code: "PREF93-PV", watch_status: "ecarte", discard_reason: "Hors champ" },
  ],
  dossiers: [
    { opportunity_key: "pdv-2027", funder_code: "PREF93-PV", title: "Agir pour l'emploi par les mots 2027", stage: "en_redaction", owner: "Anis", amount_requested: 6000, portal: "dauphin" },
  ],
  subventions_en_cours: [
    { funder_code: "PREF93-PV", title: "Agir pour l'emploi par les mots 2026", portal_ref: "00376679", amount_granted: 3000, acte: "PREFD93-26-0214 du 21/10/2026", stage: "accorde" },
    { funder_code: "CD93", title: "Agir In 2026", amount_granted: 3000, stage: "accorde" },
  ],
  echeances: [
    { kind: "depot", due_at: "2026-12-01T23:59:00+01:00", title: "Dépôt politique de la ville 2027 (viser le 27/11)", dossier_key: "pdv-2027" },
    { kind: "compte_rendu", due_at: "2027-06-30T23:59:00+02:00", title: "Évaluation Agir In 2026", funder_code: "CD93" },
  ],
};

describe("Reprise — plan d'import", () => {
  it("compte, clés stables, liens et date limite du dossier reprise de l'opportunité", () => {
    const p = planImport(fixture);
    expect([p.funders.length, p.opportunities.length, p.applications.length, p.deadlines.length]).toEqual([2, 3, 3, 2]);
    expect(p.applications.map((a) => a.import_key)).toEqual([
      "dossier:pdv-2027",
      "subvention:PREF93-PV:agir-pour-l-emploi-par-les-mots-2026",
      "subvention:CD93:agir-in-2026",
    ]);
    expect(p.applications[0]).toMatchObject({ opportunity_key: "pdv-2027", owner_hint: "Anis", deadline_at: "2026-12-01T22:59:00.000Z", stage: "en_redaction" });
    expect(p.deadlines[0]).toMatchObject({ dossier_import_key: "dossier:pdv-2027", kind: "depot", due_at: "2026-12-01T22:59:00.000Z" });
    expect(p.deadlines[1].import_key).toBe("echeance:compte_rendu:2027-06-30:evaluation-agir-in-2026");
  });

  it("deux passages donnent exactement le même plan (relançable sans doublon)", () => {
    expect(planImport(fixture)).toEqual(planImport(JSON.parse(JSON.stringify(fixture))));
  });

  it("subventions accordées : montant, n° de portail, date de l'acte quand elle est écrite", () => {
    const [, pdv2026, agirIn] = planImport(fixture).applications;
    expect(pdv2026).toMatchObject({ stage: "accorde", amount_granted: 3000, portal_ref: "00376679", granted_on: "2026-10-21", notes: "Acte : PREFD93-26-0214 du 21/10/2026" });
    expect(agirIn.granted_on).toBeNull();
    expect(acteDate("Convention 2026 E11 26 6076")).toBeNull();
  });

  it("« à confirmer » reste visible ; une opportunité écartée garde sa raison", () => {
    const p = planImport(fixture);
    expect(p.opportunities[1].eligibility_notes).toBe("À confirmer : dépôt fait ou non");
    expect(p.opportunities[1].funder_name).toBe("Fondation RAJA");
    expect(p.opportunities[2]).toMatchObject({ watch_status: "ecarte", discard_reason: "Hors champ" });
    expect(p.opportunities.every((o) => o.source === "saisie")).toBe(true);
  });

  it("références cassées refusées avec un message clair", () => {
    expect(() => planImport({ ...fixture, dossiers: [{ ...fixture.dossiers[0], opportunity_key: "inconnue" }] })).toThrow("introuvable");
    expect(() => planImport({ ...fixture, echeances: [{ kind: "autre", due_at: "2026-12-01", title: "Orpheline" }] })).toThrow("ni dossier");
    expect(() => planImport({ ...fixture, opportunites: [...fixture.opportunites, fixture.opportunites[0]] })).toThrow("double");
    expect(() => planImport({ version: 2 })).toThrow("invalide");
  });

  it("financeur inconnu du fichier signalé (recherché dans la base)", () => {
    const p = planImport({ ...fixture, echeances: [...fixture.echeances, { kind: "autre", due_at: "2027-01-10", title: "RDV", funder_code: "REGION-IDF" }] });
    expect(p.warnings.join(" ")).toContain("REGION-IDF");
  });
});

describe("Reprise — sans écraser le travail fait", () => {
  it("un financeur existant n'est complété que sur ses champs vides", () => {
    expect(missingEnrichment(
      { kind: "etat", website: null, portal: "", contacts: [], usual_rules: "déjà saisi" },
      { kind: "commune", website: "https://x", portal: "dauphin", contacts: [{ fonction: "x" }], usual_rules: "nouveau" },
    )).toEqual({ website: "https://x", portal: "dauphin", contacts: [{ fonction: "x" }] });
  });
  it("une échéance de dépôt du fichier précise l'échéance automatique du même jour (pas de doublon)", () => {
    expect(sameDepositDay({ kind: "depot", due_at: "2026-12-01T22:59:00Z" }, { due_at: "2026-12-01T20:00:00Z" })).toBe(true);
    expect(sameDepositDay({ kind: "depot", due_at: "2026-12-01T22:59:00Z" }, { due_at: "2026-12-02T10:00:00Z" })).toBe(false);
    expect(sameDepositDay({ kind: "autre", due_at: "2026-12-01T22:59:00Z" }, { due_at: "2026-12-01T22:59:00Z" })).toBe(false);
    expect(sameDepositDay({ kind: "depot", due_at: "2026-12-01T22:59:00Z" }, null)).toBe(false);
  });
});

describe.skipIf(!existsSync(REAL))("Reprise — fichier réel du bureau Financements", () => {
  it("se lit sans erreur et donne le volume annoncé", () => {
    const p = planImport(JSON.parse(readFileSync(REAL, "utf8")));
    expect(p.funders).toHaveLength(8);
    expect(p.opportunities).toHaveLength(16);
    expect(p.applications).toHaveLength(6); // 3 dossiers + 3 subventions en cours
    expect(p.deadlines).toHaveLength(10);
    expect(p.warnings).toEqual([]);
  });
});

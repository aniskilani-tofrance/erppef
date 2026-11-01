import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TEXT_VERSIONS,
  checkSigningLink,
  documentStates,
  documentsPermissions,
  groupDocumentsOverview,
  groupKind,
  isMissingRelation,
  learnerDocumentsRequired,
  membershipLabel,
  membershipYear,
  membershipYearFor,
  membershipYearLabel,
  pendingKinds,
  receiptNumber,
  retractationDeadline,
  signedDocumentPath,
  type SignedDocRow,
} from "@/lib/documents-apprenant/regles";

// Groupes réels de l'organisme (financeurs et dispositifs relevés en base le 01/11/2026).
const PEF_A1 = { funderCode: "PEF", programCode: "PEF_A1", programName: "PEF A1", groupName: "PEF A1 — 2026-27" };
const ATELIER = { funderCode: "PEF", programCode: "BEN_CONV", programName: "Atelier conversation (bénévoles)", groupName: "Atelier conversation — bénévoles" };
const MUNI = { funderCode: "STOBOP104", programCode: "CMSTOA1", programName: "Cours municipaux A1", groupName: "Cours municipaux A1 — Cordon" };

describe("qui signe : cours PEF et ateliers, jamais les cours municipaux", () => {
  it("cours PEF A1/A2 et ateliers bénévoles : concernés", () => {
    expect(learnerDocumentsRequired(PEF_A1)).toBe(true);
    expect(learnerDocumentsRequired({ ...PEF_A1, programCode: "PEF_A2", programName: "PEF A2" })).toBe(true);
    expect(learnerDocumentsRequired(ATELIER)).toBe(true);
    expect(learnerDocumentsRequired({ funderCode: "pef", programCode: "BEN_ALPHA" })).toBe(true);
  });

  it("sans financeur sur le groupe : celui du dispositif décide", () => {
    expect(learnerDocumentsRequired({ funderCode: null, programDefaultFunderCode: "PEF", programCode: "BEN_LE" })).toBe(true);
    expect(learnerDocumentsRequired({ funderCode: null, programDefaultFunderCode: "STOBOP104", programCode: "PREPA_EXAM" })).toBe(false);
    expect(learnerDocumentsRequired({ funderCode: null })).toBe(false);
  });

  it("cours municipaux : jamais, même avec le financeur PEF posé par erreur", () => {
    expect(learnerDocumentsRequired(MUNI)).toBe(false);
    expect(learnerDocumentsRequired({ ...MUNI, funderCode: "PEF" })).toBe(false);
    expect(learnerDocumentsRequired({ funderCode: "PEF", programCode: "X", groupName: "Cours municipaux B1 — Berthoud" })).toBe(false);
    expect(learnerDocumentsRequired({ funderCode: "STORH", programCode: "CPB1" })).toBe(false);
  });

  it("autres financeurs (France Travail, CPF, politique de la ville, BOP 104 direct) : leur propre convention", () => {
    for (const code of ["FT", "CPF", "PDV", "BOP104"]) expect(learnerDocumentsRequired({ funderCode: code, programCode: "FLESTO" })).toBe(false);
  });

  it("atelier ou cours (quelques phrases du contrat changent)", () => {
    expect(groupKind(ATELIER)).toBe("atelier");
    expect(groupKind({ funderCode: "PEF", programName: "Atelier lecture-écriture (bénévoles)" })).toBe("atelier");
    expect(groupKind(PEF_A1)).toBe("cours");
  });
});

describe("année d'adhésion (1er septembre → 31 août)", () => {
  it("bascule au 1er septembre", () => {
    expect(membershipYear("2026-08-31")).toBe(2025);
    expect(membershipYear("2026-09-01")).toBe(2026);
    expect(membershipYear("2027-06-30")).toBe(2026);
    expect(membershipYearLabel(2026)).toBe("2026-2027");
  });

  it("groupe qui commence plus tard : l'année de son début", () => {
    expect(membershipYearFor("2027-08-20", "2027-09-14")).toBe(2027);
    expect(membershipYearFor("2026-11-01", "2026-10-05")).toBe(2026);
    expect(membershipYearFor("2026-11-01", null)).toBe(2026);
  });

  it("délai pour changer d'avis : 10 jours sur place, 14 jours à distance (heure de Paris)", () => {
    expect(retractationDeadline("2026-11-01T23:30:00Z", "sur_place")).toBe("2026-11-12"); // 0h30 à Paris le 2 novembre
    expect(retractationDeadline("2026-11-01T10:00:00Z", "sur_place")).toBe("2026-11-11");
    expect(retractationDeadline("2026-11-01T10:00:00Z", "lien")).toBe("2026-11-15");
  });

  it("n° de reçu stable par personne et par année", () => {
    expect(receiptNumber(2026, 42, "33333333-3333-4333-8333-333333333333")).toBe("ADH-2026-0042");
    expect(receiptNumber(2026, null, "abcdef12-3333-4333-8333-333333333333")).toBe("ADH-2026-ABCDEF12");
  });
});

const row = (over: Partial<SignedDocRow>): SignedDocRow => ({
  id: "d1",
  kind: "adhesion",
  groupId: "g1",
  year: 2026,
  textVersion: DOCUMENT_TEXT_VERSIONS.adhesion,
  signedAt: "2026-11-01T10:00:00Z",
  channel: "sur_place",
  ...over,
});

describe("statuts des documents", () => {
  it("rien de signé : les trois sont à signer", () => {
    const s = documentStates([], { groupId: "g1", year: 2026 });
    expect(pendingKinds(s)).toEqual(["adhesion", "contrat_formation", "reglement_interieur"]);
    expect(s.adhesion.state).toBe("a_signer");
  });

  it("adhésion et règlement valent pour l'année, le contrat pour le groupe", () => {
    const rows = [
      row({ kind: "adhesion", groupId: "autre-groupe" }),
      row({ id: "d2", kind: "reglement_interieur", groupId: "autre-groupe", textVersion: DOCUMENT_TEXT_VERSIONS.reglement_interieur }),
      row({ id: "d3", kind: "contrat_formation", groupId: "autre-groupe", textVersion: DOCUMENT_TEXT_VERSIONS.contrat_formation }),
    ];
    const s = documentStates(rows, { groupId: "g1", year: 2026 });
    expect(s.adhesion.state).toBe("signe");
    expect(s.reglement_interieur.state).toBe("signe");
    expect(s.contrat_formation.state).toBe("a_signer"); // signé pour un autre groupe
    expect(pendingKinds(s)).toEqual(["contrat_formation"]);
    // Nouvelle année : adhésion et règlement à refaire
    expect(pendingKinds(documentStates(rows, { groupId: "autre-groupe", year: 2027 }))).toEqual(["adhesion", "reglement_interieur"]);
  });

  it("texte modifié depuis la signature : à re-signer", () => {
    const s = documentStates([row({ textVersion: "2025-09-01" })], { groupId: "g1", year: 2026 });
    expect(s.adhesion.state).toBe("ancienne_version");
    expect(s.adhesion.docId).toBe("d1");
    expect(pendingKinds(s)).toContain("adhesion");
  });

  it("vue d'ensemble du groupe : pas tout signé, pas payé, complet", () => {
    const signedAll = documentStates(
      [row({}), row({ id: "b", kind: "contrat_formation", textVersion: DOCUMENT_TEXT_VERSIONS.contrat_formation }), row({ id: "c", kind: "reglement_interieur", textVersion: DOCUMENT_TEXT_VERSIONS.reglement_interieur })],
      { groupId: "g1", year: 2026 },
    );
    const paid = { year: 2026, amountCents: 4000, paid: true, paidOn: "2026-11-12", paymentMethod: "especes" as const, receiptNo: "ADH-2026-0001", note: null };
    const o = groupDocumentsOverview([
      { learnerId: "a", name: "A", states: signedAll, membership: paid },
      { learnerId: "b", name: "B", states: signedAll, membership: null },
      { learnerId: "c", name: "C", states: documentStates([], { groupId: "g1", year: 2026 }), membership: paid },
    ]);
    expect(o.total).toBe(3);
    expect(o.complete).toBe(1);
    expect(o.unsigned.map((l) => l.name)).toEqual(["C"]);
    expect(o.unpaid.map((l) => l.name)).toEqual(["B"]);
    expect(membershipLabel(paid)).toBe("payée le 12/11 (espèces)");
    expect(membershipLabel(null)).toBe("non payée");
  });
});

describe("droits", () => {
  it("admin et coordination : tout", () => {
    for (const role of ["admin", "coordinator"] as const) {
      expect(documentsPermissions(role, false)).toEqual({ view: true, signHere: true, sendLink: true, recordPayment: true, download: true });
    }
  });

  it("formatrice : faire signer dans SES groupes, jamais la cotisation ni le dossier", () => {
    expect(documentsPermissions("trainer", true)).toEqual({ view: true, signHere: true, sendLink: true, recordPayment: false, download: false });
    expect(documentsPermissions("trainer", false).view).toBe(false);
    expect(documentsPermissions("trainer", false).signHere).toBe(false);
  });

  it("lecteur, stagiaire, commercial : rien", () => {
    for (const role of ["viewer", "stagiaire", "setter"] as const) expect(Object.values(documentsPermissions(role, true)).some(Boolean)).toBe(false);
  });
});

describe("lien personnel", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const link = { orgId: "org-1", expiresAt: "2026-11-30T10:00:00Z" };
  const learner = { orgId: "org-1" };
  const group = { ...PEF_A1, orgId: "org-1" };

  it("valable : même organisme, inscrit, groupe concerné, pas expiré", () => {
    expect(checkSigningLink({ link, learner, group, enrolled: true, now })).toEqual({ ok: true });
  });

  it("refusé : jeton inconnu, autre organisme, expiré, plus inscrit, cours municipal", () => {
    expect(checkSigningLink({ link: null, learner, group, enrolled: true, now })).toEqual({ ok: false, reason: "introuvable" });
    expect(checkSigningLink({ link, learner: { orgId: "org-2" }, group, enrolled: true, now })).toEqual({ ok: false, reason: "autre_organisation" });
    expect(checkSigningLink({ link, learner, group: { ...group, orgId: "org-2" }, enrolled: true, now })).toEqual({ ok: false, reason: "autre_organisation" });
    expect(checkSigningLink({ link: { ...link, expiresAt: "2026-11-01T09:59:59Z" }, learner, group, enrolled: true, now })).toEqual({ ok: false, reason: "expire" });
    expect(checkSigningLink({ link, learner, group, enrolled: false, now })).toEqual({ ok: false, reason: "non_inscrit" });
    expect(checkSigningLink({ link, learner, group: { ...MUNI, orgId: "org-1" }, enrolled: true, now })).toEqual({ ok: false, reason: "non_concerne" });
  });
});

describe("base pas encore migrée et rangement", () => {
  it("reconnaît une table absente (migration 0059 non appliquée)", () => {
    expect(isMissingRelation({ code: "42P01", message: 'relation "learner_memberships" does not exist' })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205", message: "Could not find the table 'public.learner_signed_documents' in the schema cache" })).toBe(true);
    expect(isMissingRelation({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });

  it("PDF signé rangé avec les pièces du dossier (nettoyé avec la fiche)", () => {
    expect(signedDocumentPath("org", "l1", "contrat_formation", "d9")).toBe("org/apprenants/l1/signe-contrat_formation-d9.pdf");
  });
});

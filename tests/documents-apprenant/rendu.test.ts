import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendu HTML des écrans (react-dom/server) : polices Google et actions serveur simulées.
vi.mock("next/font/google", () => ({ Outfit: () => ({ variable: "font-titre" }), DM_Sans: () => ({ variable: "font-texte" }) }));
vi.mock("@/app/signer/[token]/actions", () => ({ signDocuments: async () => ({ ok: true, signed: [] }) }));
vi.mock("@/app/(app)/apprenants/documents-actions", () => ({
  prepareSigningLink: async () => ({ ok: false, error: "test" }),
  recordMembershipPayment: async () => ({ ok: true }),
  cancelMembershipPayment: async () => ({ ok: true }),
  loadLearnerSignatures: async () => ({ ok: false, error: "test" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { DocumentReader } = await import("@/components/documents-apprenant/document-reader");
const { SigningFlow } = await import("@/components/documents-apprenant/signing-flow");
const { SigningShell, SigningUnavailable } = await import("@/components/documents-apprenant/signing-shell");
const { GroupDocumentsCard } = await import("@/components/documents-apprenant/group-documents-card");
const { adhesionText, contratText, reglementText } = await import("@/lib/documents-apprenant/textes");
const { documentStates, documentsPermissions, DOCUMENT_TEXT_VERSIONS } = await import("@/lib/documents-apprenant/regles");

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => decode(renderToStaticMarkup(el));

const group = {
  name: "Atelier conversation — bénévoles",
  programName: "Atelier conversation (bénévoles)",
  level: "A2",
  entryLevel: null,
  kind: "atelier" as const,
  startsOn: "2026-10-08",
  endsOn: "2027-02-25",
  totalHours: 28,
  schedule: "jeudi 14h-16h",
  place: "Salle 13 — 14 rue Alexandre Bachelet",
  capacity: 12,
  trainerName: null,
  priceEuros: 0,
};

describe("page de signature (téléphone)", () => {
  it("document lisible : « L'essentiel » en tête, sections, version", () => {
    const out = html(createElement(DocumentReader, { text: contratText(group), step: 2, total: 3 }));
    expect(out).toContain("Document 2 sur 3");
    expect(out).toContain("L'essentiel");
    expect(out.indexOf("L'essentiel")).toBeLessThan(out.indexOf("1. L'objet du contrat"));
    expect(out).toContain("8. Le délai pour changer d'avis (rétractation)");
    expect(out).toContain("animés par des bénévoles");
    expect(out).toContain(`Version du texte : ${DOCUMENT_TEXT_VERSIONS.contrat_formation}`);
  });

  it("accueil : bonjour, les 3 documents, « Commencer », aux couleurs ParlerEmploi", () => {
    const page = {
      ok: true as const,
      firstName: "Prénom",
      fullName: "Prénom Exemple",
      groupName: group.name,
      channel: "lien" as const,
      texts: [adhesionText(2026), contratText(group), reglementText()],
      signedKinds: [],
      retractationUntil: "2026-11-15",
    };
    const out = html(createElement(SigningShell, null, createElement(SigningFlow, { token: "t", page })));
    expect(out).toContain("Bonjour Prénom");
    expect(out).toContain("Bulletin d'adhésion");
    expect(out).toContain("Contrat de formation");
    expect(out).toContain("Règlement intérieur");
    expect(out).toContain("Commencer");
    expect(out).toContain("/logo-pef.png");
    expect(out).toContain("#00504E");
    expect(out).toContain("font-texte"); // police DM Sans (variable CSS)
  });

  it("tout déjà signé : copies à télécharger (lien), sans autre donnée", () => {
    const page = { ok: true as const, firstName: "Prénom", fullName: "Prénom Exemple", groupName: "PEF A1", channel: "lien" as const, texts: [], signedKinds: ["adhesion" as const], retractationUntil: null };
    const out = html(createElement(SigningFlow, { token: "tok", page }));
    expect(out).toContain("Tout est déjà signé");
    expect(out).toContain('href="/signer/tok/copie/adhesion"');
  });

  it("lien invalide : message seul, aucun nom", () => {
    const out = html(createElement(SigningUnavailable, { message: "Ce lien n'est pas reconnu." }));
    expect(out).toContain("Lien indisponible");
    expect(out).toContain("Ce lien n'est pas reconnu.");
  });
});

describe("carte de la fiche groupe", () => {
  const states = documentStates([], { groupId: "g", year: 2026 });
  const rows = [
    { learnerId: "a", name: "Prénom Exemple", states, membership: null },
    { learnerId: "b", name: "Autre Exemple", states, membership: { year: 2026, amountCents: 4000, paid: true, paidOn: "2026-10-20", paymentMethod: "especes" as const, receiptNo: "ADH-2026-0001", note: null } },
  ];

  it("coordination : qui n'a pas signé, qui n'a pas payé, boutons tablette, WhatsApp et cotisation", () => {
    const out = html(createElement(GroupDocumentsCard, { groupId: "g", year: 2026, rows, perms: documentsPermissions("coordinator", false), available: true }));
    expect(out).toContain("2 / 2 n'ont pas tout signé");
    expect(out).toContain("1 cotisation 2026-2027 non payée");
    expect(out).toContain("Faire signer ici");
    expect(out).toContain("Lien WhatsApp");
    expect(out).toContain("Cotisation payée");
    expect(out).toContain("Reçu");
    expect(out).toContain("à signer");
  });

  it("formatrice : faire signer, sans cotisation", () => {
    const out = html(createElement(GroupDocumentsCard, { groupId: "g", year: 2026, rows, perms: documentsPermissions("trainer", true), available: true }));
    expect(out).toContain("Faire signer ici");
    expect(out).not.toContain("Cotisation payée");
    expect(out).not.toContain("non payée");
  });

  it("migration absente : message clair", () => {
    const out = html(createElement(GroupDocumentsCard, { groupId: "g", year: 2026, rows, perms: documentsPermissions("admin", false), available: false }));
    expect(out).toContain("migration 0059");
  });
});

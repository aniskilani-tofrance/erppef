import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DOCUMENT_TEXT_VERSIONS } from "@/lib/documents-apprenant/regles";
import { ASSOCIATION, adhesionText, contratText, documentMarkdown, learnerIdentityLines, reglementText, type GroupForText } from "@/lib/documents-apprenant/textes";
import { buildMembershipReceiptPdf, buildSignedDocumentPdf, receiptFileName, sha256, signedDocumentFileName } from "@/lib/documents-apprenant/pdf";
import { pdfText } from "./fake-supabase";

const group: GroupForText = {
  name: "PEF A1 — 2026-27",
  programName: "PEF A1",
  level: "A2",
  entryLevel: "A1",
  kind: "cours",
  startsOn: "2026-10-05",
  endsOn: "2027-06-14",
  totalHours: 300,
  schedule: "lundi 9h30-12h30, jeudi 9h30-12h30",
  place: "Salle 12 — 14 rue Alexandre Bachelet, 93400 Saint-Ouen-sur-Seine",
  capacity: 15,
  trainerName: "Marie Exemple",
  priceEuros: 0,
};
const all = (t: ReturnType<typeof contratText>) => [t.title, t.subtitle, ...t.essentials, ...t.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])])].join("\n");
// Pixel PNG 1×1 : signature de test
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const identity = learnerIdentityLines({ firstName: "Prénom", lastName: "Exemple", birthDate: "1990-03-14", gender: "femme", address: "1 rue de l'Exemple", postalCode: "93400", city: "Saint-Ouen-sur-Seine", phone: "06 00 00 00 01", email: null, ref: "A-0042" });

describe("textes : mentions de l'association (jamais la SASU)", () => {
  it("NDA, SIRET, siège et président de l'association", () => {
    const t = all(contratText(group));
    expect(t).toContain("11931070593");
    expect(t).toContain("924 182 546 00011");
    expect(t).toContain("23 avenue Gabriel Péri, 93400 Saint-Ouen-sur-Seine");
    expect(t).toContain("Anis Kilani, président");
    expect(t).not.toMatch(/11931197893|990 084 121|Martin Levasseur/); // SASU
  });
});

describe("contrat de formation : mentions L6353-3 à L6353-7", () => {
  const t = all(contratText(group));
  it("objet, nature, durée, dates, horaires, lieu, effectif, niveau d'entrée", () => {
    expect(t).toContain("L6313-1");
    expect(t).toContain("300 heures");
    expect(t).toContain("du 5 octobre 2026 au 14 juin 2027");
    expect(t).toContain("lundi 9h30-12h30");
    expect(t).toContain("14 rue Alexandre Bachelet");
    expect(t).toContain("15 personnes au maximum");
    expect(t).toContain("niveau A1");
    expect(t).toContain("Niveau visé : A2");
  });
  it("moyens, formateurs, évaluation, sanction de la formation", () => {
    expect(t).toMatch(/formatrices de français langue étrangère/);
    expect(t).toContain("Marie Exemple");
    expect(t).toContain("test de positionnement");
    expect(t).toContain("attestation de fin de formation");
  });
  it("prix, paiement, rétractation 10 jours (14 à distance), abandon, réclamation", () => {
    expect(t).toContain("gratuite pour vous : 0 €");
    expect(t).toContain("L6353-6");
    expect(t).toContain("10 jours après la signature");
    expect(t).toContain("L6353-5");
    expect(t).toContain("14 jours");
    expect(t).toContain("lettre recommandée avec accusé de réception");
    expect(t).toContain("force majeure");
    expect(t).toContain("contact@parleremploi.fr");
  });
  it("atelier : animé par des bénévoles", () => {
    expect(all(contratText({ ...group, kind: "atelier", trainerName: null }))).toContain("animés par des bénévoles");
  });
});

describe("règlement intérieur : R6352-1 et suivants", () => {
  const t = all(reglementText());
  it("hygiène et sécurité, discipline, échelle des sanctions, procédure, délégués", () => {
    expect(t).toContain("fumer");
    expect(t).toContain("avertissement écrit");
    expect(t).toContain("exclusion définitive");
    expect(t).toContain("jamais d'amende");
    expect(t).toContain("par écrit, de ce qui vous est reproché");
    expect(t).toContain("une personne de votre choix");
    expect(t).toContain("un jour franc et au plus 15 jours");
    expect(t).toContain("500 heures");
  });
});

describe("bulletin d'adhésion", () => {
  it("cotisation 40 €, année 2026-2027, droits et fin d'adhésion", () => {
    const t = all(adhesionText(2026));
    expect(t).toContain("40 €");
    expect(t).toContain("2026-2027");
    expect(t).toContain("du 1er septembre 2026 au 31 août 2027");
    expect(t).toContain("assemblée générale");
    expect(t).toContain("HelloAsso");
  });
  it("textes versionnés, Markdown de relecture", () => {
    expect(adhesionText(2026).version).toBe(DOCUMENT_TEXT_VERSIONS.adhesion);
    const md = documentMarkdown(reglementText());
    expect(md.startsWith("# Règlement intérieur")).toBe(true);
    expect(md).toContain("## Article 10 — Vos droits avant une sanction");
  });
});

describe("PDF signé", () => {
  it("contrat : texte, identité, signature, date limite de rétractation, preuve", async () => {
    const bytes = await buildSignedDocumentPdf({
      text: contratText(group),
      identity,
      proof: { docId: "doc-123", signerName: "Prénom Exemple", signedAt: "2026-11-01T10:00:00Z", channel: "lien", ip: "203.0.113.7", userAgent: "Mozilla/5.0 (iPhone)", signaturePng: PNG },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getTitle()).toContain("Contrat de formation professionnelle");
    const text = await pdfText(bytes);
    expect(text).toContain("CONTRAT DE FORMATION PROFESSIONNELLE");
    expect(text).toContain(ASSOCIATION.name);
    expect(text).toContain("Prénom Exemple (dossier n° A-0042)");
    expect(text).toContain("Signé à distance");
    expect(text).toContain("jusqu'au 15 novembre 2026 inclus");
    expect(text).toContain("doc-123");
    expect(text).toContain("203.0.113.7");
    expect(text).toContain(`version du texte : ${DOCUMENT_TEXT_VERSIONS.contrat_formation}`);
    expect(text).toMatch(/Page 1 \/ \d/);
    expect(sha256(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("bulletin d'adhésion : cotisation et année ; règlement : case « lu et accepté »", async () => {
    const proof = { docId: "d", signerName: "Prénom Exemple", signedAt: "2026-11-01T10:00:00Z", channel: "sur_place" as const, ip: null, userAgent: null, signaturePng: PNG };
    const adh = await pdfText(await buildSignedDocumentPdf({ text: adhesionText(2026), identity, membership: { year: 2026, amountCents: 4000 }, proof }));
    expect(adh).toContain("Montant : 40,00 €");
    expect(adh).toContain("2026-2027");
    expect(adh).toContain("Signé sur place");
    const reg = await pdfText(await buildSignedDocumentPdf({ text: reglementText(), identity, proof }));
    expect(reg).toContain("RÈGLEMENT INTÉRIEUR");
    expect(reg).toContain("Case cochée par la personne");
    expect(reg).not.toContain("changer d'avis : jusqu'au"); // seulement sur le contrat
  });

  it("signature illisible : le PDF part quand même (cadre vide), sans planter", async () => {
    const bytes = await buildSignedDocumentPdf({ text: reglementText(), identity, proof: { docId: "d", signerName: "X", signedAt: "2026-11-01T10:00:00Z", channel: "lien", ip: null, userAgent: null, signaturePng: "data:image/png;base64,AAAA" } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it("reçu de cotisation : n°, montant, date, mode, pas un reçu fiscal", async () => {
    const text = await pdfText(await buildMembershipReceiptPdf({ receiptNo: "ADH-2026-0042", learnerName: "Prénom Exemple", identity, year: 2026, amountCents: 4000, paidOn: "2026-11-12", method: "cheque", issuedOn: new Date("2026-11-12T10:00:00Z") }));
    expect(text).toContain("ADH-2026-0042");
    expect(text).toContain("Montant : 40,00 €");
    expect(text).toContain("12 novembre 2026");
    expect(text).toContain("Chèque");
    expect(text).toContain("pas un reçu fiscal");
    expect(receiptFileName("ADH-2026-0042", "Prénom Exemple")).toBe("recu_cotisation_ADH-2026-0042_prenom-exemple.pdf");
    expect(signedDocumentFileName("contrat_formation", "Prénom Exemple")).toBe("contrat-de-formation_prenom-exemple.pdf");
  });
});

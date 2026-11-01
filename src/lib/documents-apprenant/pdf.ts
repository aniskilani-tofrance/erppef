import { createHash } from "node:crypto";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { pdfSafe, slug, wrapText } from "@/lib/reports/group-planning";
import {
  DOCUMENT_LABELS,
  euros,
  membershipPeriod,
  membershipYearLabel,
  paymentMethodLabel,
  retractationDeadline,
  type PaymentMethod,
  type SignedDocumentKind,
  type SigningChannel,
} from "./regles";
import { ASSOCIATION, type DocumentText } from "./textes";

// PDF des documents signés (bulletin d'adhésion, contrat, règlement intérieur) et reçu de
// cotisation, aux couleurs ParlerEmploi : vert canard #00504E, vert vif #32CF8A, fond menthe.
// Polices standard du PDF (comme les autres documents de l'ERP) : rien à embarquer.

const TEAL = rgb(0, 80 / 255, 78 / 255); // #00504E
const VIVID = rgb(50 / 255, 207 / 255, 138 / 255); // #32CF8A
const MINT = rgb(232 / 255, 246 / 255, 240 / 255); // #E8F6F0
const INK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.42, 0.45, 0.5);
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const BOTTOM = 60; // place du pied de page
const TZ = "Europe/Paris";

export type SignatureProof = {
  docId: string;
  signerName: string;
  signedAt: string; // ISO
  channel: SigningChannel;
  ip: string | null;
  userAgent: string | null;
  signaturePng: string; // data:image/png;base64,…
};

export type SignedPdfInput = {
  text: DocumentText;
  identity: string[]; // lignes « qui signe »
  membership?: { year: number; amountCents: number } | null; // bulletin d'adhésion
  proof: SignatureProof;
};

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const timeFr = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h");
const dayFr = (d: string) => dateFr(`${d.slice(0, 10)}T12:00:00Z`);

class Writer {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly logo: PDFImage | null,
    readonly runningTitle: string,
  ) {
    this.newPage(true);
  }

  get width() {
    return A4.width - 2 * MARGIN;
  }

  newPage(first = false) {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN;
    if (first) this.header();
    else {
      this.text(this.runningTitle, MARGIN, 8.5, this.bold, TEAL);
      this.y -= 22;
    }
  }

  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  text(s: string, x: number, size: number, f: PDFFont = this.font, color = INK) {
    this.page.drawText(pdfSafe(s), { x, y: this.y, size, font: f, color });
  }

  paragraph(s: string, size = 9.5, f: PDFFont = this.font, color = INK, indent = 0, lineH = size + 4.5) {
    for (const ln of wrapText(s, this.width - indent, size, f)) {
      this.ensure(lineH);
      this.text(ln, MARGIN + indent, size, f, color);
      this.y -= lineH;
    }
  }

  bullet(s: string, size = 9.5) {
    const lines = wrapText(s, this.width - 14, size, this.font);
    lines.forEach((ln, i) => {
      this.ensure(size + 4.5);
      if (i === 0) this.page.drawCircle({ x: MARGIN + 4, y: this.y + size * 0.32, size: 1.6, color: VIVID });
      this.text(ln, MARGIN + 14, size, this.font);
      this.y -= size + 4.5;
    });
  }

  header() {
    const top = this.y;
    if (this.logo) {
      const scale = 46 / this.logo.height;
      this.page.drawImage(this.logo, { x: MARGIN, y: top - 46, width: this.logo.width * scale, height: 46 });
    }
    const x = MARGIN + 62;
    this.y = top - 12;
    this.text(ASSOCIATION.name, x, 15, this.bold, TEAL);
    this.y -= 13;
    this.text(ASSOCIATION.form, x, 8, this.font, GRAY);
    this.y -= 10;
    this.text(ASSOCIATION.ndaLine, x, 8, this.font, GRAY);
    this.y -= 10;
    this.text(`SIRET ${ASSOCIATION.siret} · siège : ${ASSOCIATION.address}`, x, 8, this.font, GRAY);
    this.y = top - 70;
  }

  /** Encadré menthe (titre + lignes), avec la barre vert vif à gauche. */
  box(title: string, lines: string[], size = 9.5) {
    const wrapped = lines.flatMap((l) => wrapText(l, this.width - 26, size, this.font));
    const h = 22 + wrapped.length * (size + 4.5) + 6;
    this.ensure(h + 8);
    const top = this.y + 4;
    this.page.drawRectangle({ x: MARGIN, y: top - h, width: this.width, height: h, color: MINT });
    this.page.drawRectangle({ x: MARGIN, y: top - h, width: 3, height: h, color: VIVID });
    this.y = top - 15;
    this.text(title.toUpperCase(), MARGIN + 13, 8.5, this.bold, TEAL);
    this.y -= 14;
    for (const ln of wrapped) {
      this.text(ln, MARGIN + 13, size, this.font);
      this.y -= size + 4.5;
    }
    this.y = top - h - 14;
  }

  footer() {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      p.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: A4.width - MARGIN, y: 40 }, thickness: 0.5, color: VIVID });
      p.drawText(pdfSafe(`${ASSOCIATION.name} · ${ASSOCIATION.phone} · ${ASSOCIATION.email} · ${this.runningTitle}`), { x: MARGIN, y: 28, size: 7, font: this.font, color: GRAY });
      const label = `Page ${i + 1} / ${n}`;
      p.drawText(label, { x: A4.width - MARGIN - this.font.widthOfTextAtSize(label, 7), y: 28, size: 7, font: this.font, color: GRAY });
    });
  }
}

async function setup(title: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
  } catch {
    logo = null;
  }
  doc.setTitle(title);
  doc.setAuthor(ASSOCIATION.name);
  doc.setCreator("ERP ParlerEmploi Formation");
  return { doc, w: new Writer(doc, font, bold, logo, title) };
}

function titleBlock(w: Writer, title: string, subtitle: string) {
  w.text(title.toUpperCase(), MARGIN, 17, w.bold, TEAL);
  w.y -= 7;
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: MARGIN + 70, y: w.y }, thickness: 2, color: VIVID });
  w.y -= 15;
  w.paragraph(subtitle, 9, w.font, GRAY);
  w.y -= 8;
}

/** Image PNG d'un data URL de signature, ou null si illisible. */
async function embedSignature(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  try {
    return await doc.embedPng(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

function channelPhrase(channel: SigningChannel): string {
  return channel === "sur_place"
    ? `Signé sur place, sur la tablette de l'association, à ${ASSOCIATION.city}.`
    : "Signé à distance, avec le lien personnel envoyé par l'association.";
}

/** PDF signé d'un document : texte complet, case « lu et accepté », signature au doigt, preuve. */
export async function buildSignedDocumentPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const { text: t, proof } = input;
  const { doc, w } = await setup(`${t.title} — ${proof.signerName}`);
  titleBlock(w, t.title, `${t.subtitle} · version du texte : ${t.version}`);

  w.box(t.kind === "adhesion" ? "Le membre" : t.kind === "contrat_formation" ? "Le stagiaire (vous)" : "Le stagiaire", input.identity);
  if (t.kind === "adhesion" && input.membership) {
    w.box("La cotisation", [
      `Année d'adhésion ${membershipYearLabel(input.membership.year)} (${membershipPeriod(input.membership.year)}).`,
      `Montant : ${euros(input.membership.amountCents)}. Le paiement est enregistré à part par l'association, qui remet un reçu.`,
    ]);
  }
  w.box("L'essentiel", t.essentials);

  for (const s of t.sections) {
    w.ensure(40);
    w.y -= 2;
    w.paragraph(s.heading, 10.5, w.bold, TEAL);
    w.y -= 1;
    for (const p of s.paragraphs ?? []) w.paragraph(p);
    for (const b of s.bullets ?? []) w.bullet(b);
    w.y -= 6;
  }

  // Bloc signature (toujours entier sur une page)
  const signature = await embedSignature(doc, proof.signaturePng);
  w.ensure(230);
  w.y -= 4;
  w.paragraph("Signature", 10.5, w.bold, TEAL);
  w.y -= 2;
  // Case cochée
  w.page.drawRectangle({ x: MARGIN, y: w.y - 2, width: 10, height: 10, borderColor: TEAL, borderWidth: 1, color: MINT });
  w.page.drawText("X", { x: MARGIN + 2.2, y: w.y, size: 8.5, font: w.bold, color: TEAL });
  const accept = wrapText(`Case cochée par la personne : « ${t.acceptLabel} »`, w.width - 18, 9.5, w.font);
  for (const ln of accept) {
    w.text(ln, MARGIN + 18, 9.5);
    w.y -= 14;
  }
  w.y -= 4;
  w.paragraph(`Fait à ${ASSOCIATION.city}, le ${dateFr(proof.signedAt)} à ${timeFr(proof.signedAt)} (heure de Paris).`, 9.5);
  w.paragraph(channelPhrase(proof.channel), 9.5);
  if (t.kind === "contrat_formation") {
    w.paragraph(`Délai pour changer d'avis : jusqu'au ${dayFr(retractationDeadline(proof.signedAt, proof.channel))} inclus.`, 9.5, w.bold);
  }
  w.y -= 6;

  const colW = (w.width - 20) / 2;
  const top = w.y;
  w.text(t.kind === "adhesion" ? "Le membre" : "Le stagiaire", MARGIN, 9, w.bold, TEAL);
  w.text("Pour l'association", MARGIN + colW + 20, 9, w.bold, TEAL);
  w.y -= 12;
  w.text(proof.signerName, MARGIN, 9.5);
  w.text(`${ASSOCIATION.president}, ${ASSOCIATION.presidentTitle}`, MARGIN + colW + 20, 9.5);
  const boxTop = w.y - 6;
  const boxH = 70;
  w.page.drawRectangle({ x: MARGIN, y: boxTop - boxH, width: colW, height: boxH, borderColor: GRAY, borderWidth: 0.5 });
  if (signature) {
    const scale = Math.min((colW - 10) / signature.width, (boxH - 10) / signature.height);
    w.page.drawImage(signature, { x: MARGIN + 5, y: boxTop - boxH + 5, width: signature.width * scale, height: signature.height * scale });
  }
  w.y = boxTop - 14;
  for (const ln of wrapText(`Document émis par l'association ${ASSOCIATION.name} avec son outil de gestion, au nom de son président.`, colW, 8.5, w.font)) {
    w.page.drawText(pdfSafe(ln), { x: MARGIN + colW + 20, y: w.y, size: 8.5, font: w.font, color: GRAY });
    w.y -= 11;
  }
  w.y = top - 12 - 6 - boxH - 22;

  w.paragraph(
    `Preuve de signature électronique — identifiant ${proof.docId} · horodatage ${proof.signedAt} (UTC) · adresse IP ${proof.ip ?? "inconnue"} · appareil : ${(proof.userAgent ?? "inconnu").slice(0, 160)} · texte « ${DOCUMENT_LABELS[t.kind]} », version du ${t.version}.`,
    7,
    w.font,
    GRAY,
    0,
    9,
  );

  w.footer();
  return doc.save();
}

/** Empreinte SHA-256 du PDF (gardée en base : on peut prouver que le fichier n'a pas changé). */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function signedDocumentFileName(kind: SignedDocumentKind, learnerName: string): string {
  return `${slug(DOCUMENT_LABELS[kind]).toLowerCase()}_${slug(learnerName).toLowerCase()}.pdf`;
}

// ── Reçu de cotisation ──────────────────────────────────────────────────────

export type ReceiptInput = {
  receiptNo: string;
  learnerName: string;
  identity: string[];
  year: number;
  amountCents: number;
  paidOn: string; // AAAA-MM-JJ
  method: PaymentMethod | null;
  issuedOn?: Date;
};

export async function buildMembershipReceiptPdf(r: ReceiptInput): Promise<Uint8Array> {
  const { doc, w } = await setup(`Reçu de cotisation ${r.receiptNo}`);
  titleBlock(w, "Reçu de cotisation", `Reçu n° ${r.receiptNo} · année d'adhésion ${membershipYearLabel(r.year)}`);
  w.box("Le membre", r.identity);
  w.paragraph(
    `L'association ${ASSOCIATION.name} confirme avoir reçu de ${r.learnerName} la somme de ${euros(r.amountCents)}, pour sa cotisation annuelle de membre, année d'adhésion ${membershipYearLabel(r.year)} (${membershipPeriod(r.year)}).`,
    11,
    w.font,
    INK,
    0,
    16,
  );
  w.y -= 6;
  w.box("Le paiement", [
    `Montant : ${euros(r.amountCents)}`,
    `Payé le : ${dayFr(r.paidOn)}`,
    `Mode de paiement : ${paymentMethodLabel(r.method)}`,
  ]);
  w.paragraph(
    "Ce reçu n'est pas un reçu fiscal : il ne donne pas droit à une réduction d'impôt. La cotisation n'est pas le prix des cours.",
    8.5,
    w.font,
    GRAY,
  );
  w.y -= 26;
  w.paragraph(`Fait à ${ASSOCIATION.city}, le ${dateFr((r.issuedOn ?? new Date()).toISOString())}.`, 10);
  w.paragraph(`${ASSOCIATION.president}, ${ASSOCIATION.presidentTitle} de ${ASSOCIATION.name}`, 10, w.bold);
  w.y -= 56;
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: MARGIN + 200, y: w.y }, thickness: 0.5, color: GRAY });
  w.y -= 11;
  w.text("Signature et cachet", MARGIN, 7.5, w.font, GRAY);
  w.footer();
  return doc.save();
}

export function receiptFileName(receiptNo: string, learnerName: string): string {
  return `recu_cotisation_${slug(receiptNo)}_${slug(learnerName).toLowerCase()}.pdf`;
}

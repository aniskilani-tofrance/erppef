import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { CONTACT_SOURCES, GOALS } from "@/lib/referentiels";
import { learnerRef } from "@/lib/refs";

// Dossier d'entrée d'un apprenant (Qualiopi ind. 4) : identité, besoin exprimé,
// positionnement. Même charte que le bilan financeur (lib/reports/funder-report-pdf.ts).
const PEF_GREEN = rgb(0.059, 0.298, 0.227);
const PEF_EMERALD = rgb(0.169, 0.682, 0.494);
const GRAY = rgb(0.42, 0.45, 0.5);

const ORG_LEGAL = {
  name: "ParlerEmploi Formation",
  nda: "Déclaration d'activité n° 11931070593 (préfecture d'Île-de-France)",
  siret: "SIRET 924 182 546 00011",
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

export type EntryFileData = {
  learnerNo: number | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  firstLanguage: string | null;
  city: string | null;
  prescriber: string | null;
  contactSource?: string | null;
  contactSourceDetail?: string | null;
  activityStatus: string | null;
  entryGoal: string | null;
  entryNeed: string | null;
  entryInterviewOn: string | null;
  levelAssessed: string | null;
  lastTest: { doneAt: string; level: string | null; score: number | null } | null;
  // Parcours d'admission : réunion d'information suivie, test oral d'entrée
  infoMeetingOn?: string | null;
  oralTest?: { on: string; level: string | null; evaluator: string | null; comment: string | null } | null;
};

const ACTIVITY_LABELS: Record<string, string> = {
  demandeur_emploi: "Demandeur d'emploi",
  rsa: "RSA",
  salarie: "Salarié",
  scolaire_etudiant: "Scolaire / étudiant",
  inactif_autre: "Inactif / autre",
};

function goalLabel(code: string | null): string {
  return GOALS.find((g) => g.code === code)?.label ?? "Non renseigné";
}

function fmtDate(day: string | null): string {
  return day ? new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
}

// Découpe un texte libre en lignes tenant dans la page.
function wrap(str: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of str.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function entryFileName(data: Pick<EntryFileData, "firstName" | "lastName">): string {
  const slug = `${data.firstName}-${data.lastName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-");
  return `dossier_entree_${slug}.pdf`;
}

export async function buildEntryFilePdf(data: EntryFileData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const text = (str: string, x: number, size: number, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(str, { x, y, size, font: f, color });

  // ── En-tête ──
  try {
    const logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
    const scale = 42 / logo.height;
    page.drawImage(logo, { x: MARGIN, y: y - 42, width: logo.width * scale, height: 42 });
  } catch {
    // logo indisponible : on continue sans
  }
  y -= 14;
  text(ORG_LEGAL.name, MARGIN + 110, 16, bold, PEF_GREEN);
  y -= 16;
  text(ORG_LEGAL.nda, MARGIN + 110, 8, font, GRAY);
  y -= 11;
  text(ORG_LEGAL.siret, MARGIN + 110, 8, font, GRAY);
  y -= 34;

  text("DOSSIER D'ENTRÉE — ANALYSE DU BESOIN", MARGIN, 15, bold, PEF_GREEN);
  y -= 15;
  text("Positionnement et recueil du besoin à l'entrée en formation (Qualiopi ind. 4)", MARGIN, 9, font, GRAY);
  y -= 13;
  text(`Édité le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`, MARGIN, 9, font, GRAY);
  y -= 26;

  const sectionTitle = (title: string) => {
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 3, height: 12, color: PEF_EMERALD });
    text(title, MARGIN + 9, 11, bold, PEF_GREEN);
    y -= 20;
  };
  const field = (label: string, value: string) => {
    text(label, MARGIN + 8, 9.5);
    text(value, MARGIN + 200, 9.5, bold, PEF_GREEN);
    y -= 15;
  };

  // ── Identité ──
  sectionTitle("Identité");
  field("Apprenant", `${data.firstName} ${data.lastName}${data.learnerNo ? ` (${learnerRef(data.learnerNo)})` : ""}`);
  field("Date de naissance", fmtDate(data.birthDate));
  field("Langue première", data.firstLanguage ?? "—");
  field("Commune de résidence", data.city ?? "—");
  field("Situation", data.activityStatus ? (ACTIVITY_LABELS[data.activityStatus] ?? data.activityStatus) : "—");
  field("Prescripteur", data.prescriber ?? "—");
  {
    const source = CONTACT_SOURCES.find((s) => s.code === data.contactSource)?.label;
    field("Nous a contactés par", source ? `${source}${data.contactSourceDetail ? ` (${data.contactSourceDetail})` : ""}` : "—");
  }
  y -= 12;

  // ── Analyse du besoin ──
  sectionTitle("Analyse du besoin");
  field("Entretien d'entrée", fmtDate(data.entryInterviewOn));
  field("Objectif visé", goalLabel(data.entryGoal));
  text("Besoin exprimé", MARGIN + 8, 9.5);
  y -= 14;
  const needLines = data.entryNeed
    ? wrap(data.entryNeed, font, 9.5, A4.width - 2 * MARGIN - 24)
    : ["— (à recueillir lors de l'entretien d'entrée)"];
  for (const line of needLines) {
    text(line, MARGIN + 16, 9.5, font, data.entryNeed ? rgb(0, 0, 0) : GRAY);
    y -= 13;
  }
  y -= 12;

  // ── Positionnement ──
  sectionTitle("Positionnement linguistique");
  field("Niveau évalué", data.levelAssessed ?? "Non évalué");
  if (data.lastTest) {
    field("Test de positionnement", `fait le ${fmtDate(data.lastTest.doneAt)}`);
    if (data.lastTest.level) {
      field(
        "Résultat du test",
        `${data.lastTest.level}${data.lastTest.score != null ? ` (score ${data.lastTest.score})` : ""}`,
      );
    }
  } else {
    field("Test de positionnement", "non réalisé");
  }
  if (data.oralTest) {
    field("Test oral d'entrée", `fait le ${fmtDate(data.oralTest.on)}${data.oralTest.evaluator ? ` par ${data.oralTest.evaluator}` : ""}`);
    field("Niveau à l'oral", data.oralTest.level ?? "Non déterminé");
    if (data.oralTest.comment) {
      text("Observations", MARGIN + 8, 9.5);
      y -= 14;
      for (const line of wrap(data.oralTest.comment, font, 9.5, A4.width - 2 * MARGIN - 24)) {
        text(line, MARGIN + 16, 9.5);
        y -= 13;
      }
    }
  } else {
    field("Test oral d'entrée", "non réalisé");
  }
  field("Réunion d'information", data.infoMeetingOn ? `suivie le ${fmtDate(data.infoMeetingOn)}` : "—");
  y -= 20;

  text(
    "Ce dossier atteste de l'analyse du besoin et du positionnement réalisés à l'entrée,",
    MARGIN, 7.5, font, GRAY,
  );
  y -= 10;
  text(
    "conformément au critère 2 du Référentiel national qualité. Résultat à confirmer en entretien.",
    MARGIN, 7.5, font, GRAY,
  );

  return doc.save();
}

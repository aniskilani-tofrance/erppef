import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import type { Distribution, FunderReport } from "./funder-report";

// Bilan financeur en PDF — même charte que la feuille d'émargement (lib/emargement/pdf.ts).
const PEF_GREEN = rgb(0.059, 0.298, 0.227);
const PEF_EMERALD = rgb(0.169, 0.682, 0.494);
const PEF_PALE = rgb(0.918, 0.957, 0.937);
const GRAY = rgb(0.42, 0.45, 0.5);

const ORG_LEGAL = {
  name: "ParlerEmploi Formation",
  nda: "Déclaration d'activité n° 11931070593 (préfecture d'Île-de-France)",
  siret: "SIRET 924 182 546 00011",
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

export function reportFileName(report: FunderReport): string {
  const slug = report.funderName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-");
  return `bilan_${slug}_${report.from}_${report.to}.pdf`;
}

function fmtDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

export async function buildFunderReportPdf(report: FunderReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const text = (str: string, x: number, size: number, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(str, { x, y, size, font: f, color });

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };

  // ── En-tête ──
  try {
    const logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
    const scale = 42 / logo.height;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - 42,
      width: logo.width * scale,
      height: 42,
    });
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

  text("BILAN D'ACTIVITÉ PAR FINANCEUR", MARGIN, 15, bold, PEF_GREEN);
  y -= 20;
  text(`Financeur : ${report.funderName}`, MARGIN, 11, bold);
  y -= 15;
  text(`Période : du ${fmtDate(report.from)} au ${fmtDate(report.to)}`, MARGIN, 10);
  y -= 13;
  text(
    `Édité le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`,
    MARGIN, 9, font, GRAY,
  );
  y -= 24;

  // ── Chiffres clés ──
  const t = report.totals;
  const kpis: [string, string][] = [
    ["Groupes concernés", String(t.groupCount)],
    ["Séances réalisées", String(t.sessionsDone)],
    ["Heures réalisées", `${t.hoursDone.toLocaleString("fr-FR")} h`],
    ["Heures à venir (période)", `${t.hoursPlanned.toLocaleString("fr-FR")} h`],
    ["Bénéficiaires uniques", String(t.uniqueLearners)],
    ["Assiduité moyenne", t.averageAttendanceRate != null ? `${t.averageAttendanceRate} %` : "—"],
    ["Sorties : abandons", String(t.exits.abandon)],
    ["Sorties : parcours terminés", String(t.exits.termine)],
  ];
  sectionTitle("Chiffres clés");
  for (const [label, value] of kpis) {
    newPageIfNeeded(14);
    text(label, MARGIN + 8, 9.5);
    text(value, MARGIN + 260, 9.5, bold, PEF_GREEN);
    y -= 14;
  }
  y -= 10;

  // ── Typologie ──
  sectionTitle("Typologie des bénéficiaires");
  distributionBlock("Sexe", report.distributions.gender);
  distributionBlock("Âge (au dernier jour de la période)", report.distributions.age);
  distributionBlock("Situation", report.distributions.activity);
  distributionBlock("Quartiers prioritaires (QPV)", report.distributions.qpv);
  distributionBlock("Reconnaissance handicap (RQTH)", report.distributions.rqth);
  distributionBlock("Scolarisation", report.distributions.education);
  distributionBlock("Communes de résidence", report.distributions.cities.slice(0, 12));
  distributionBlock("Quartiers (découpage municipal)", report.distributions.districts.filter((d) => d.label !== "Non renseigné").slice(0, 12));
  distributionBlock("Canal de premier contact (comment ils nous ont trouvés)", report.distributions.sources);

  // ── Détail par groupe ──
  newPageIfNeeded(60);
  sectionTitle("Détail par groupe");
  newPageIfNeeded(16);
  page.drawRectangle({ x: MARGIN, y: y - 4, width: A4.width - 2 * MARGIN, height: 15, color: PEF_PALE });
  text("Groupe", MARGIN + 4, 8.5, bold);
  text("Inscrits", MARGIN + 230, 8.5, bold);
  text("Séances", MARGIN + 290, 8.5, bold);
  text("Heures", MARGIN + 350, 8.5, bold);
  text("Assiduité", MARGIN + 420, 8.5, bold);
  y -= 17;
  for (const g of report.groupDetails) {
    newPageIfNeeded(14);
    text(truncate(g.name, 44), MARGIN + 4, 8.5);
    text(String(g.learnerCount), MARGIN + 230, 8.5);
    text(String(g.sessionsDone), MARGIN + 290, 8.5);
    text(`${g.hoursDone.toLocaleString("fr-FR")} h`, MARGIN + 350, 8.5);
    text(g.attendanceRate != null ? `${g.attendanceRate} %` : "—", MARGIN + 420, 8.5);
    y -= 13;
  }

  // ── Pied ──
  newPageIfNeeded(40);
  y = Math.max(y - 20, MARGIN + 10);
  text(
    "Assiduité calculée sur les feuilles d'émargement signées et clôturées (détail nominatif dans l'export CSV joint).",
    MARGIN, 7.5, font, GRAY,
  );

  return doc.save();

  function sectionTitle(title: string) {
    newPageIfNeeded(30);
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 3, height: 12, color: PEF_EMERALD });
    text(title, MARGIN + 9, 11, bold, PEF_GREEN);
    y -= 20;
  }

  function distributionBlock(title: string, dist: Distribution) {
    if (dist.length === 0) return;
    newPageIfNeeded(18 + dist.length * 12);
    text(title, MARGIN + 8, 9, bold);
    y -= 13;
    const total = dist.reduce((s, d) => s + d.count, 0);
    for (const d of dist) {
      newPageIfNeeded(12);
      const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
      text(`${d.label}`, MARGIN + 16, 8.5);
      text(`${d.count}`, MARGIN + 260, 8.5, bold);
      text(`${pct} %`, MARGIN + 300, 8.5, font, GRAY);
      y -= 12;
    }
    y -= 8;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { loadCertificateData } from "@/lib/emargement/certificat";
import { PLANNING_THEME, pdfSafe, slug, wrapText } from "@/lib/reports/group-planning";
import { MARK_LABELS, SKILLS, type Mark } from "@/lib/evaluations/grid";

// Attestation d'acquis remise à l'apprenant en fin de parcours : heures suivies, niveau à
// l'entrée, compétences évaluées à mi-parcours et en fin de parcours (3 crans CECRL),
// niveau atteint. Document de l'organisme : ne vaut pas certification officielle.

const { PEF_GREEN, PEF_EMERALD, PEF_PALE, GRAY, A4, MARGIN, TZ, ORG_LEGAL } = PLANNING_THEME;

export type AttestationGrid = { co: Mark | null; po: Mark | null; ce: Mark | null; pe: Mark | null; levelReached: string | null; comment: string | null; evaluatedAt: string | null };

export type AttestationData = {
  learnerName: string;
  groupName: string;
  programName: string | null;
  trainerName: string | null;
  firstSessionOn: string | null;
  lastSessionOn: string | null;
  hoursAttended: number;
  sessionsAttended: number;
  sessionsTotal: number;
  entryLevel: string | null;
  midterm: AttestationGrid | null;
  final: AttestationGrid;
};

export async function loadAttestationData(groupId: string, learnerId: string, orgId: string): Promise<AttestationData | null> {
  const supabase = createAdminClient();
  const [certificate, { data: learner }, { data: evals }, { data: group }] = await Promise.all([
    loadCertificateData(groupId, learnerId, orgId),
    supabase.from("learners").select("level_assessed").eq("id", learnerId).eq("org_id", orgId).single(),
    supabase.from("evaluations").select("kind, co, po, ce, pe, level_reached, comment, evaluated_at").eq("group_id", groupId).eq("learner_id", learnerId),
    supabase.from("groups").select("trainers:trainer_id(first_name, last_name)").eq("id", groupId).eq("org_id", orgId).single(),
  ]);
  if (!certificate || !learner) return null;
  const toGrid = (kind: string): AttestationGrid | null => {
    const e = (evals ?? []).find((x) => x.kind === kind);
    return e ? { co: e.co, po: e.po, ce: e.ce, pe: e.pe, levelReached: e.level_reached, comment: e.comment, evaluatedAt: e.evaluated_at } : null;
  };
  const final = toGrid("finale");
  if (!final) return null;
  const trainer = group?.trainers as unknown as { first_name: string; last_name: string | null } | null;
  return {
    ...certificate,
    trainerName: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
    entryLevel: learner.level_assessed,
    midterm: toGrid("mi_parcours"),
    final,
  };
}

export function attestationFileName(data: AttestationData): string {
  return `attestation_acquis_${slug(data.learnerName)}_${slug(data.groupName)}.pdf`;
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const fmtHours = (h: number) => h.toFixed(1).replace(".", ",").replace(",0", "");

export async function buildAttestationPdf(data: AttestationData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const text = (str: string, x: number, size: number, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(pdfSafe(str), { x, y, size, font: f, color });
  const paragraph = (str: string, size: number, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1), lineH = size + 4) => {
    for (const ln of wrapText(str, A4.width - 2 * MARGIN, size, f)) {
      text(ln, MARGIN, size, f, color);
      y -= lineH;
    }
  };

  // En-tête
  try {
    const logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
    const scale = 42 / logo.height;
    page.drawImage(logo, { x: MARGIN, y: y - 42, width: logo.width * scale, height: 42 });
  } catch {
    // logo indisponible
  }
  y -= 14;
  text(ORG_LEGAL.name, MARGIN + 110, 16, bold, PEF_GREEN);
  y -= 16;
  text(ORG_LEGAL.nda, MARGIN + 110, 8, font, GRAY);
  y -= 11;
  text(ORG_LEGAL.siret, MARGIN + 110, 8, font, GRAY);
  y -= 40;

  text("ATTESTATION D'ACQUIS", MARGIN, 20, bold, PEF_GREEN);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 70, y }, thickness: 2, color: PEF_EMERALD });
  y -= 26;

  paragraph(`${ORG_LEGAL.name} atteste que`, 11);
  y -= 2;
  text(data.learnerName, MARGIN, 15, bold);
  y -= 22;
  const period = data.firstSessionOn && data.lastSessionOn ? ` du ${fmtDay(data.firstSessionOn)} au ${fmtDay(data.lastSessionOn)}` : "";
  paragraph(
    `a suivi la formation « ${data.groupName} »${data.programName ? ` (${data.programName})` : ""}${period}, soit ${fmtHours(data.hoursAttended)} heures de cours de français sur ${data.sessionsAttended} séance${data.sessionsAttended > 1 ? "s" : ""} suivie${data.sessionsAttended > 1 ? "s" : ""}${data.trainerName ? `, avec ${data.trainerName}` : ""}.`,
    11,
  );
  y -= 8;
  paragraph(
    `Niveau à l'entrée : ${data.entryLevel ?? "non renseigné"}.   Niveau atteint en fin de parcours : ${data.final.levelReached ?? "non renseigné"}.`,
    11,
    bold,
    PEF_GREEN,
  );
  y -= 14;

  // Tableau des compétences
  const cols = [
    { l: "Compétence (référentiel CECRL)", w: 235 },
    { l: "Mi-parcours", w: 130 },
    { l: "Fin de parcours", w: 130 },
  ];
  const tableW = cols.reduce((n, c) => n + c.w, 0);
  page.drawRectangle({ x: MARGIN, y: y - 5, width: tableW, height: 18, color: PEF_PALE });
  let x = MARGIN + 6;
  for (const c of cols) {
    text(c.l, x, 9.5, bold, PEF_GREEN);
    x += c.w;
  }
  y -= 22;
  const mark = (m: Mark | null | undefined) => (m ? MARK_LABELS[m] : "—");
  for (const s of SKILLS) {
    x = MARGIN + 6;
    text(s.label, x, 10, bold);
    text(s.hint, x, 7.5, font, GRAY);
    x += cols[0].w;
    const mid = data.midterm?.[s.code] ?? null;
    const fin = data.final[s.code];
    page.drawText(pdfSafe(mark(mid)), { x, y: y + 2, size: 10, font, color: mid === "acquis" ? PEF_GREEN : rgb(0.2, 0.2, 0.2) });
    x += cols[1].w;
    page.drawText(pdfSafe(mark(fin)), { x, y: y + 2, size: 10, font: fin === "acquis" ? bold : font, color: fin === "acquis" ? PEF_GREEN : rgb(0.2, 0.2, 0.2) });
    y -= 2;
    // ligne d'indice sous le libellé
    y -= 20;
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: MARGIN + tableW, y: y + 8 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
  }
  y -= 4;
  text("Acquis : la compétence est mobilisée de façon autonome au niveau visé · En cours : mobilisée avec aide · Non acquis : pas encore mobilisée.", MARGIN, 7.5, font, GRAY);
  y -= 22;

  if (data.final.comment) {
    text("Appréciation de la formatrice", MARGIN, 10, bold, PEF_GREEN);
    y -= 14;
    paragraph(data.final.comment, 10, font, rgb(0.15, 0.15, 0.15));
    y -= 10;
  }

  // Mention et signature
  paragraph(
    "Attestation établie par l'organisme de formation sur la base de l'évaluation de la formatrice et, le cas échéant, d'un test écrit et oral. Elle ne vaut pas certification officielle de niveau de langue (DCL, TCF, DELF) ; les heures suivies sont justifiées par les feuilles d'émargement signées.",
    8,
    font,
    GRAY,
    11,
  );
  y -= 26;
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  text(`Fait à Saint-Ouen-sur-Seine, le ${today}`, MARGIN, 10);
  y -= 14;
  text(`Pour ${ORG_LEGAL.name}${data.trainerName ? ` — ${data.trainerName}, formatrice` : ""}`, MARGIN, 10);
  y -= 60;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.5, color: GRAY });
  y -= 10;
  text("Signature et cachet", MARGIN, 7.5, font, GRAY);

  page.drawText(pdfSafe(`${ORG_LEGAL.name} · ${ORG_LEGAL.phone}`), { x: A4.width - MARGIN - 180, y: 28, size: 7.5, font, color: GRAY });
  return doc.save();
}

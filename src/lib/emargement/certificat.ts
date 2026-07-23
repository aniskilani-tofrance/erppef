import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGO_PEF_BASE64 } from "./logo-data";

// Certificat de réalisation (modèle inspiré du certificat officiel du ministère
// du Travail) : par apprenant × groupe, à partir des émargements clôturés.

const ORG = {
  name: "ParlerEmploi Formation",
  nda: "11931070593",
  siret: "924 182 546 00011",
  city: "Saint-Ouen-sur-Seine",
};

const PEF_GREEN = rgb(0.059, 0.298, 0.227);
const PEF_EMERALD = rgb(0.169, 0.682, 0.494);

export type CertificateData = {
  learnerName: string;
  groupName: string;
  programName: string | null;
  firstSessionOn: string | null; // première séance réalisée
  lastSessionOn: string | null; // dernière séance réalisée
  hoursAttended: number;
  sessionsAttended: number;
  sessionsTotal: number;
};

export async function loadCertificateData(
  groupId: string,
  learnerId: string,
  orgId: string,
): Promise<CertificateData | null> {
  const supabase = createAdminClient();

  const [{ data: group }, { data: learner }, { data: rows }] = await Promise.all([
    supabase.from("groups").select("id, name, programs(name)").eq("id", groupId).eq("org_id", orgId).single(),
    supabase.from("learners").select("first_name, last_name").eq("id", learnerId).eq("org_id", orgId).single(),
    supabase
      .from("attendances")
      .select("status, sessions!inner(starts_at, ends_at, attendance_closed_at, group_id)")
      .eq("learner_id", learnerId)
      .eq("sessions.group_id", groupId)
      .not("sessions.attendance_closed_at", "is", null),
  ]);
  if (!group || !learner) return null;

  const attended = (rows ?? [])
    .filter((r) => r.status !== "absent")
    .map((r) => r.sessions as unknown as { starts_at: string; ends_at: string })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    learnerName: `${learner.first_name} ${learner.last_name}`,
    groupName: group.name,
    programName: (group.programs as unknown as { name: string } | null)?.name ?? null,
    firstSessionOn: attended[0]?.starts_at ?? null,
    lastSessionOn: attended[attended.length - 1]?.starts_at ?? null,
    hoursAttended: attended.reduce(
      (sum, s) => sum + (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000,
      0,
    ),
    sessionsAttended: attended.length,
    sessionsTotal: (rows ?? []).length,
  };
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const fmtHours = (h: number) => h.toFixed(1).replace(".", ",").replace(",0", "");

export async function buildCertificatePdf(data: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const M = 60;
  let y = 780;

  const text = (p: PDFPage, str: string, x: number, yy: number, f: PDFFont, size: number, color = rgb(0.12, 0.16, 0.23)) =>
    p.drawText(str, { x, y: yy, size, font: f, color });

  // En-tête
  try {
    const logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
    const scale = 60 / logo.height;
    page.drawImage(logo, { x: M, y: y - 44, width: logo.width * scale, height: 60 });
  } catch {
    // sans logo, le certificat reste valide
  }
  text(page, "CERTIFICAT DE RÉALISATION", M + 90, y - 8, bold, 18, PEF_GREEN);
  text(page, ORG.name, M + 90, y - 28, bold, 10, PEF_EMERALD);
  y -= 60;
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 1.5, color: PEF_EMERALD });
  y -= 40;

  // Corps
  const lines: { t: string; b?: boolean }[] = [
    { t: `Je soussigné(e), représentant légal de l'organisme de formation ${ORG.name}` },
    { t: `(Déclaration d'activité n° ${ORG.nda} — SIRET ${ORG.siret}),` },
    { t: "atteste que :" },
    { t: "" },
    { t: data.learnerName, b: true },
    { t: "" },
    { t: "a suivi l'action de formation :" },
    { t: `${data.programName ?? data.groupName}${data.programName ? ` — groupe « ${data.groupName} »` : ""}`, b: true },
    { t: "Nature de l'action : action de formation" },
    { t: "" },
  ];
  if (data.firstSessionOn && data.lastSessionOn) {
    lines.push({ t: `du ${fmtDay(data.firstSessionOn)} au ${fmtDay(data.lastSessionOn)},` });
  }
  lines.push(
    { t: `pour une durée réalisée de ${fmtHours(data.hoursAttended)} heures`, b: true },
    { t: `(${data.sessionsAttended} séance${data.sessionsAttended > 1 ? "s" : ""} suivie${data.sessionsAttended > 1 ? "s" : ""} sur ${data.sessionsTotal} émargée${data.sessionsTotal > 1 ? "s" : ""}, assiduité contrôlée par émargement électronique).` },
  );

  for (const l of lines) {
    if (l.t) text(page, l.t, M, y, l.b ? bold : font, l.b ? 13 : 11);
    y -= l.t ? 20 : 10;
  }

  y -= 30;
  text(page, `Fait à ${ORG.city}, le ${fmtDay(new Date().toISOString())}`, M, y, font, 11);
  y -= 30;
  text(page, "Signature et cachet de l'organisme :", M, y, font, 10);
  page.drawRectangle({ x: M, y: y - 110, width: 220, height: 95, borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 1 });

  text(
    page,
    "Document généré par l'ERP PEF à partir des feuilles d'émargement signées électroniquement.",
    M, 60, font, 8,
  );

  return doc.save();
}

export function certificateFileName(data: CertificateData): string {
  const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return `certificat_${slug(data.learnerName)}_${slug(data.groupName)}.pdf`;
}

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { utcToLocalTime } from "@/lib/dates";
import { LOGO_PEF_BASE64 } from "./logo-data";

// Charte ParlerEmploi
const PEF_GREEN = rgb(0.059, 0.298, 0.227); // #0F4C3A
const PEF_EMERALD = rgb(0.169, 0.682, 0.494); // #2BAE7E
const PEF_PALE = rgb(0.918, 0.957, 0.937); // vert très pâle (fond d'en-tête de tableau)

// Mentions légales de l'organisme sur la feuille (org unique en pratique).
// À déplacer en base si l'ERP devient réellement multi-organismes.
const ORG_LEGAL = {
  name: "ParlerEmploi Formation",
  nda: "Déclaration d'activité n° 11931070593 (préfecture d'Île-de-France)",
  siret: "SIRET 924 182 546 00011",
};

const STATUS_LABELS: Record<string, string> = {
  present: "Présent",
  retard: "Retard",
  absent: "Absent",
};

export type AttendanceSheetData = {
  groupName: string;
  programName: string | null;
  trainerName: string | null;
  roomName: string | null;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  trainerSignature: string | null;
  rows: {
    name: string;
    status: string;
    signedAt: string | null;
    signature: string | null;
  }[];
};

// Charge tout le nécessaire à la feuille. À appeler APRÈS requireRole (client service_role).
export async function loadAttendanceSheetData(
  sessionId: string,
  orgId: string,
): Promise<AttendanceSheetData | null> {
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, group_id, starts_at, ends_at, attendance_closed_at, trainer_signature, groups(name, programs(name)), trainers:trainer_id(first_name, last_name), rooms:room_id(name)",
    )
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .single();
  if (!session) return null;

  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("learner_id, learners(first_name, last_name)")
      .eq("group_id", session.group_id)
      .eq("status", "inscrit"),
    supabase
      .from("attendances")
      .select("learner_id, status, signed_at, signature")
      .eq("session_id", sessionId),
  ]);

  const byLearner = new Map((attendances ?? []).map((a) => [a.learner_id, a]));
  const rows = (enrollments ?? [])
    .map((e) => {
      const l = e.learners as unknown as { first_name: string; last_name: string } | null;
      const a = byLearner.get(e.learner_id);
      return {
        name: l ? `${l.first_name} ${l.last_name}` : "—",
        status: a?.status ?? "absent",
        signedAt: a?.signed_at ?? null,
        signature: a?.signature ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const group = session.groups as unknown as { name: string; programs: { name: string } | null } | null;
  const trainer = session.trainers as unknown as { first_name: string; last_name: string } | null;
  const room = session.rooms as unknown as { name: string } | null;

  return {
    groupName: group?.name ?? "Groupe",
    programName: group?.programs?.name ?? null,
    trainerName: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
    roomName: room?.name ?? null,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    closedAt: session.attendance_closed_at,
    trainerSignature: session.trainer_signature,
    rows,
  };
}

async function embedDataUrlPng(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  try {
    return await doc.embedPng(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Paris",
  });
}

export function sheetFileName(data: AttendanceSheetData): string {
  const day = new Date(data.startsAt).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // YYYY-MM-DD
  const slug = data.groupName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return `emargement_${day}_${slug}.pdf`;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const ROW_HEIGHT = 42;
const COLS = { name: 180, status: 70, time: 75, signature: 170 };

export async function buildAttendancePdf(data: AttendanceSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const durationHours =
    (new Date(data.endsAt).getTime() - new Date(data.startsAt).getTime()) / 3_600_000;

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const text = (p: PDFPage, str: string, x: number, yy: number, f: PDFFont, size: number) =>
    p.drawText(str, { x, y: yy, size, font: f, color: rgb(0.12, 0.16, 0.23) });

  // En-tête organisme : logo + titre aux couleurs de la charte
  const logo = await embedDataUrlPng(doc, `data:image/png;base64,${LOGO_PEF_BASE64}`);
  let textX = MARGIN;
  if (logo) {
    const scale = 52 / logo.height;
    page.drawImage(logo, { x: MARGIN, y: y - 40, width: logo.width * scale, height: 52 });
    textX = MARGIN + logo.width * scale + 14;
  }
  page.drawText("FEUILLE D'ÉMARGEMENT", { x: textX, y, size: 16, font: bold, color: PEF_GREEN });
  y -= 22;
  page.drawText(ORG_LEGAL.name, { x: textX, y, size: 10, font: bold, color: PEF_EMERALD });
  y -= 14;
  text(page, `${ORG_LEGAL.nda} — ${ORG_LEGAL.siret}`, textX, y, font, 8.5);
  y -= 24;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y },
    thickness: 1.5, color: PEF_EMERALD,
  });
  y -= 18;

  // Bloc séance
  const info: [string, string][] = [
    ["Dispositif", data.programName ?? "—"],
    ["Groupe", data.groupName],
    ["Date", fmtDate(data.startsAt)],
    ["Horaires", `${utcToLocalTime(data.startsAt)} – ${utcToLocalTime(data.endsAt)} (${durationHours.toFixed(1).replace(".", ",")} h)`],
    ["Formateur", data.trainerName ?? "—"],
    ["Salle", data.roomName ?? "—"],
  ];
  for (const [label, value] of info) {
    text(page, `${label} :`, MARGIN, y, bold, 10);
    text(page, value, MARGIN + 75, y, font, 10);
    y -= 15;
  }
  y -= 10;

  const tableHeader = (p: PDFPage, yy: number): number => {
    let x = MARGIN;
    p.drawRectangle({
      x: MARGIN, y: yy - 6, width: A4.width - 2 * MARGIN, height: 20,
      color: PEF_PALE,
    });
    for (const [label, w] of [
      ["Nom de l'apprenant", COLS.name],
      ["Statut", COLS.status],
      ["Signé à", COLS.time],
      ["Signature", COLS.signature],
    ] as [string, number][]) {
      text(p, label, x + 4, yy, bold, 9);
      x += w;
    }
    return yy - 24;
  };

  y = tableHeader(page, y);

  for (const row of data.rows) {
    if (y < MARGIN + ROW_HEIGHT + 90) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
      y = tableHeader(page, y);
    }

    page.drawLine({
      start: { x: MARGIN, y: y - ROW_HEIGHT + 14 },
      end: { x: A4.width - MARGIN, y: y - ROW_HEIGHT + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });

    let x = MARGIN;
    text(page, row.name, x + 4, y - 10, font, 10);
    x += COLS.name;
    text(page, STATUS_LABELS[row.status] ?? row.status, x + 4, y - 10, font, 10);
    x += COLS.status;
    text(page, row.signedAt ? utcToLocalTime(row.signedAt) : "—", x + 4, y - 10, font, 10);
    x += COLS.time;

    if (row.signature) {
      const img = await embedDataUrlPng(doc, row.signature);
      if (img) {
        const scale = Math.min((COLS.signature - 10) / img.width, (ROW_HEIGHT - 8) / img.height);
        page.drawImage(img, {
          x: x + 4,
          y: y - ROW_HEIGHT + 16,
          width: img.width * scale,
          height: img.height * scale,
        });
      }
    }
    y -= ROW_HEIGHT;
  }

  // Contre-signature formateur
  if (y < MARGIN + 110) {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  }
  y -= 16;
  text(page, `Signature du formateur${data.trainerName ? ` (${data.trainerName})` : ""} :`, MARGIN, y, bold, 10);
  if (data.trainerSignature) {
    const img = await embedDataUrlPng(doc, data.trainerSignature);
    if (img) {
      const scale = Math.min(180 / img.width, 55 / img.height);
      page.drawImage(img, { x: MARGIN, y: y - 62, width: img.width * scale, height: img.height * scale });
    }
  }
  y -= 78;
  if (data.closedAt) {
    text(
      page,
      `Feuille clôturée le ${fmtDate(data.closedAt)} à ${utcToLocalTime(data.closedAt)}.`,
      MARGIN, y, font, 8.5,
    );
    y -= 12;
  }
  text(
    page,
    `Document généré par l'ERP PEF le ${fmtDate(new Date().toISOString())}. Signatures recueillies électroniquement (horodatées).`,
    MARGIN, y, font, 8.5,
  );

  return doc.save();
}

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { PLANNING_THEME, describePattern, fmtDay, localDate, pdfSafe, slug, wrapText } from "@/lib/reports/group-planning";

// Attestation d'entrée en formation : remise à chaque apprenant qui a réellement commencé
// le cours, c'est-à-dire présent (ou en retard) sur au moins une feuille d'émargement
// clôturée. La date d'entrée est celle de cette première présence : elle est prouvée par
// l'émargement signé. Document de l'association, signé par son président.

const { PEF_GREEN, PEF_EMERALD, PEF_PALE, GRAY, A4, MARGIN, TZ, ORG_LEGAL } = PLANNING_THEME;
export const ENTRY_SIGNATORY = { name: "Anis Kilani", title: "Président" };
// Repère dans le carnet de contact : sert à afficher « envoyée le … » et à ne jamais renvoyer.
export const ENTRY_CONTACT_MARK = "Attestation d'entrée en formation";

export type AttendanceRow = { learnerId: string; status: string; startsAt: string; closed: boolean };

/** Date (AAAA-MM-JJ, heure de Paris) de la première présence émargée par apprenant. */
export function firstPresenceByLearner(rows: AttendanceRow[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const r of rows) {
    if (!r.closed || r.status === "absent") continue;
    const prev = first.get(r.learnerId);
    if (!prev || r.startsAt < prev) first.set(r.learnerId, r.startsAt);
  }
  return new Map([...first].map(([id, iso]) => [id, localDate(iso)]));
}

export type EntryAttestation = {
  learnerId: string;
  learnerRef: string;
  learnerName: string;
  birthDate: string | null;
  gender: string | null; // femme | homme | autre
  email: string | null;
  groupName: string;
  programName: string | null;
  level: string | null;
  schedule: string;
  place: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedHours: number;
  entryOn: string; // AAAA-MM-JJ
  funderName: string | null;
};

/** Apprenants du groupe ayant au moins une présence émargée (feuille clôturée), avec les données de l'attestation. */
export async function loadEntryAttestations(
  supabase: SupabaseClient,
  groupId: string,
  orgId: string,
  learnerId?: string,
): Promise<EntryAttestation[]> {
  const [{ data: group }, { data: sessions }, { data: enrollments }, { data: attendance }] = await Promise.all([
    supabase
      .from("groups")
      .select("name, weekly_pattern, starts_on, ends_on, programs(name, level), funders(name), rooms:room_id(name, address)")
      .eq("id", groupId)
      .eq("org_id", orgId)
      .single(),
    supabase.from("sessions").select("starts_at, ends_at, status").eq("group_id", groupId).eq("org_id", orgId).neq("status", "annulee").order("starts_at"),
    supabase
      .from("enrollments")
      .select("learner_id, learners(learner_no, first_name, last_name, birth_date, gender, email)")
      .eq("group_id", groupId)
      .eq("org_id", orgId),
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(starts_at, attendance_closed_at, group_id)")
      .eq("org_id", orgId)
      .eq("sessions.group_id", groupId),
  ]);
  if (!group) return [];

  const first = firstPresenceByLearner(
    (attendance ?? []).map((a) => {
      const s = a.sessions as unknown as { starts_at: string; attendance_closed_at: string | null };
      return { learnerId: a.learner_id as string, status: a.status as string, startsAt: s.starts_at, closed: Boolean(s.attendance_closed_at) };
    }),
  );
  const program = group.programs as unknown as { name: string; level: string | null } | null;
  const room = group.rooms as unknown as { name: string; address: string | null } | null;
  const funder = group.funders as unknown as { name: string } | null;
  const all = sessions ?? [];
  const plannedHours = all.reduce((h, s) => h + (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000, 0);

  const out: EntryAttestation[] = [];
  for (const e of enrollments ?? []) {
    if (learnerId && e.learner_id !== learnerId) continue;
    const entryOn = first.get(e.learner_id as string);
    const l = e.learners as unknown as { learner_no: number | null; first_name: string; last_name: string; birth_date: string | null; gender: string | null; email: string | null } | null;
    if (!entryOn || !l) continue;
    out.push({
      learnerId: e.learner_id as string,
      learnerRef: l.learner_no != null ? `A-${String(l.learner_no).padStart(4, "0")}` : "",
      learnerName: `${l.first_name === "?" ? "" : l.first_name} ${l.last_name}`.trim(),
      birthDate: l.birth_date,
      gender: l.gender,
      email: l.email?.trim() || null,
      groupName: group.name,
      programName: program?.name ?? null,
      level: program?.level ?? null,
      schedule: describePattern((group.weekly_pattern as { weekday: number; start: string; end: string }[] | null) ?? [], ", "),
      place: room ? [room.name, room.address].filter(Boolean).join(" — ") : null,
      plannedStart: all[0] ? localDate(all[0].starts_at) : group.starts_on,
      plannedEnd: all.length ? localDate(all[all.length - 1].starts_at) : group.ends_on,
      plannedHours,
      entryOn,
      funderName: funder?.name ?? null,
    });
  }
  return out.sort((a, b) => a.learnerName.localeCompare(b.learnerName, "fr"));
}

export function entryAttestationFileName(groupName: string, learnerName?: string): string {
  return learnerName
    ? `attestation_entree_${slug(learnerName)}_${slug(groupName)}.pdf`
    : `attestations_entree_${slug(groupName)}.pdf`;
}

const day = (d: string) => fmtDay(d, { day: "numeric", month: "long", year: "numeric" });
const hours = (h: number) => `${(Math.round(h * 10) / 10).toString().replace(".", ",")} heures`;

function drawPage(doc: PDFDocument, page: PDFPage, a: EntryAttestation, font: PDFFont, bold: PDFFont, logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null, today: string) {
  let y = A4.height - MARGIN;
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) =>
    page.drawText(pdfSafe(s), { x, y, size, font: f, color });
  const paragraph = (s: string, size: number, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1), lineH = size + 5) => {
    for (const ln of wrapText(s, A4.width - 2 * MARGIN, size, f)) {
      text(ln, MARGIN, size, f, color);
      y -= lineH;
    }
  };

  if (logo) {
    const scale = 42 / logo.height;
    page.drawImage(logo, { x: MARGIN, y: y - 42, width: logo.width * scale, height: 42 });
  }
  y -= 14;
  text(ORG_LEGAL.name, MARGIN + 110, 16, bold, PEF_GREEN);
  y -= 16;
  text("Association loi 1901 · organisme de formation", MARGIN + 110, 8, font, GRAY);
  y -= 11;
  text(ORG_LEGAL.nda, MARGIN + 110, 8, font, GRAY);
  y -= 11;
  text(ORG_LEGAL.siret, MARGIN + 110, 8, font, GRAY);
  y -= 46;

  text("ATTESTATION D'ENTRÉE EN FORMATION", MARGIN, 19, bold, PEF_GREEN);
  y -= 7;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 70, y }, thickness: 2, color: PEF_EMERALD });
  y -= 30;

  paragraph(`Je soussigné, ${ENTRY_SIGNATORY.name}, ${ENTRY_SIGNATORY.title.toLowerCase()} de l'association ${ORG_LEGAL.name}, atteste que :`, 11);
  y -= 6;
  text(a.learnerName, MARGIN, 15, bold);
  y -= 16;
  const e = a.gender === "femme" ? "e" : a.gender === "homme" ? "" : "(e)";
  const id = [a.birthDate ? `${a.gender === "femme" ? "née" : a.gender === "homme" ? "né" : "né(e)"} le ${day(a.birthDate)}` : null, a.learnerRef ? `dossier n° ${a.learnerRef}` : null].filter(Boolean).join(" · ");
  if (id) {
    text(id, MARGIN, 9.5, font, GRAY);
    y -= 18;
  } else {
    y -= 4;
  }
  paragraph(`est entré${e} en formation le ${day(a.entryOn)} et suit la formation suivante :`, 11);
  y -= 8;

  // Encadré récapitulatif
  const rows: [string, string][] = [
    ["Formation", `Cours de français${a.level ? ` — niveau ${a.level}` : ""} (${a.groupName})`],
    ...(a.programName ? ([["Programme", a.programName]] as [string, string][]) : []),
    ["Date d'entrée", `${day(a.entryOn)} (première présence émargée)`],
    ["Période prévue", a.plannedStart && a.plannedEnd ? `du ${day(a.plannedStart)} au ${day(a.plannedEnd)}` : "—"],
    ["Durée prévue", a.plannedHours > 0 ? hours(a.plannedHours) : "—"],
    ["Horaires", a.schedule || "—"],
    ["Lieu", a.place ?? "—"],
    ...(a.funderName ? ([["Financement", a.funderName]] as [string, string][]) : []),
  ];
  const labelW = 120;
  const valueW = A4.width - 2 * MARGIN - labelW - 20;
  const lines = rows.map(([l, v]) => ({ l, v: wrapText(v, valueW, 10, font) }));
  const boxH = lines.reduce((h, r) => h + r.v.length * 14 + 6, 0) + 14;
  page.drawRectangle({ x: MARGIN, y: y - boxH + 12, width: A4.width - 2 * MARGIN, height: boxH, color: PEF_PALE });
  y -= 6;
  for (const r of lines) {
    text(r.l, MARGIN + 12, 10, bold, PEF_GREEN);
    for (const v of r.v) {
      text(v, MARGIN + 12 + labelW, 10);
      y -= 14;
    }
    y -= 6;
  }
  y -= 22;

  paragraph(
    "La présence de l'apprenant(e) est justifiée par les feuilles d'émargement signées à chaque séance. Cette attestation est délivrée à la demande de l'intéressé(e) pour faire valoir ce que de droit.",
    9.5,
    font,
    rgb(0.25, 0.25, 0.25),
    13,
  );
  y -= 28;
  text(`Fait à Saint-Ouen-sur-Seine, le ${today}`, MARGIN, 10.5);
  y -= 16;
  text(`${ENTRY_SIGNATORY.name}, ${ENTRY_SIGNATORY.title.toLowerCase()} de ${ORG_LEGAL.name}`, MARGIN, 10.5, bold);
  y -= 64;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.5, color: GRAY });
  y -= 11;
  text("Signature et cachet", MARGIN, 7.5, font, GRAY);

  page.drawText(pdfSafe(`${ORG_LEGAL.name} · ${ORG_LEGAL.phone}`), { x: MARGIN, y: 28, size: 7.5, font, color: GRAY });
  void doc;
}

/** Une page par apprenant (un seul PDF pour imprimer tout le groupe, ou une page pour l'envoi individuel). */
export async function buildEntryAttestationsPdf(list: EntryAttestation[], issuedOn = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    logo = await doc.embedPng(Buffer.from(LOGO_PEF_BASE64, "base64"));
  } catch {
    logo = null;
  }
  const today = issuedOn.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  for (const a of list) drawPage(doc, doc.addPage([A4.width, A4.height]), a, font, bold, logo, today);
  doc.setTitle("Attestations d'entrée en formation");
  doc.setAuthor(ORG_LEGAL.name);
  return doc.save();
}

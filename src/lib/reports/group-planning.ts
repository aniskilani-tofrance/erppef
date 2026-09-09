import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { groupRef } from "@/lib/refs";

// Planning d'un groupe à diffuser : PDF (version apprenants ou version financeur),
// CSV (tableur du financeur) et calendrier .ics (téléphone de l'apprenant).
// Même charte que le bilan financeur et la feuille d'émargement.

const PEF_GREEN = rgb(0.059, 0.298, 0.227);
const PEF_EMERALD = rgb(0.169, 0.682, 0.494);
const PEF_PALE = rgb(0.918, 0.957, 0.937);
const GRAY = rgb(0.42, 0.45, 0.5);
const RED = rgb(0.72, 0.15, 0.15);

const ORG_LEGAL = {
  name: "ParlerEmploi Formation",
  nda: "Déclaration d'activité n° 11931070593 (préfecture d'Île-de-France)",
  siret: "SIRET 924 182 546 00011",
  phone: "06 52 67 53 93",
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const TZ = "Europe/Paris";
const DAYS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export type PlanningSession = {
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  status: "planifiee" | "realisee" | "annulee";
  roomName: string | null;
  trainerName: string | null;
};

export type GroupPlanning = {
  groupId: string;
  groupNo: number | null;
  name: string;
  programName: string | null;
  funderName: string | null;
  trainerName: string | null;
  roomName: string | null;
  roomAddress: string | null;
  startsOn: string;
  endsOn: string | null;
  totalHours: number;
  weeklyPattern: { weekday: number; start: string; end: string }[];
  skipSchoolHolidays: boolean;
  notes: string | null;
  sessions: PlanningSession[];
  holidays: { label: string; startsOn: string; endsOn: string }[]; // vacances scolaires dans la période
};

export type PlanningAudience = "apprenants" | "financeur";

// « lundi 9h-12h · mardi 9h-12h · mardi 13h-16h »
export function describePattern(pattern: { weekday: number; start: string; end: string }[], sep = " · "): string {
  const h = (t: string) => t.replace(/^0/, "").replace(":00", "h").replace(":", "h");
  return [...pattern]
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map((p) => `${DAYS[p.weekday] ?? "?"} ${h(p.start)}-${h(p.end)}`)
    .join(sep);
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }): string {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { ...opts, timeZone: TZ });
}
function localDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h");
}
function hoursOf(s: PlanningSession): number {
  return Math.round(((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3600_000) * 100) / 100;
}
function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function loadGroupPlanning(supabase: SupabaseClient, groupId: string): Promise<GroupPlanning | null> {
  const { data: g } = await supabase
    .from("groups")
    .select("id, group_no, name, starts_on, ends_on, total_hours, weekly_pattern, skip_school_holidays, notes, org_id, programs(name), funders(name), trainers:trainer_id(first_name, last_name), rooms:room_id(name, address)")
    .eq("id", groupId)
    .single();
  if (!g) return null;
  const [{ data: sessions }, { data: org }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, trainers:trainer_id(first_name, last_name), rooms:room_id(name)")
      .eq("group_id", groupId)
      .order("starts_at"),
    supabase.from("organizations").select("school_holiday_zone").eq("id", g.org_id).single(),
  ]);
  const endsOn = g.ends_on ?? (sessions?.length ? localDate(sessions[sessions.length - 1].ends_at) : null);
  const { data: closures } = await supabase
    .from("calendar_closures")
    .select("label, starts_on, ends_on, kind, zone")
    .eq("kind", "vacances_scolaires")
    .gte("ends_on", g.starts_on)
    .lte("starts_on", endsOn ?? g.starts_on)
    .order("starts_on");
  const t = g.trainers as unknown as { first_name: string; last_name: string } | null;
  const r = g.rooms as unknown as { name: string; address: string | null } | null;
  return {
    groupId: g.id,
    groupNo: g.group_no,
    name: g.name,
    programName: (g.programs as unknown as { name: string } | null)?.name ?? null,
    funderName: (g.funders as unknown as { name: string } | null)?.name ?? null,
    trainerName: t ? `${t.first_name} ${t.last_name}`.trim() : null,
    roomName: r?.name ?? null,
    roomAddress: r?.address ?? null,
    startsOn: g.starts_on,
    endsOn,
    totalHours: Number(g.total_hours),
    weeklyPattern: (g.weekly_pattern as GroupPlanning["weeklyPattern"] | null) ?? [],
    skipSchoolHolidays: g.skip_school_holidays !== false,
    notes: g.notes,
    sessions: (sessions ?? []).map((s) => {
      const st = s.trainers as unknown as { first_name: string; last_name: string } | null;
      return {
        id: s.id,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        status: s.status as PlanningSession["status"],
        roomName: (s.rooms as unknown as { name: string } | null)?.name ?? null,
        trainerName: st ? `${st.first_name} ${st.last_name}`.trim() : null,
      };
    }),
    holidays: (closures ?? [])
      .filter((c) => !c.zone || c.zone === org?.school_holiday_zone)
      .map((c) => ({ label: c.label.replace(/ \(prévisionnel\)/, ""), startsOn: c.starts_on, endsOn: c.ends_on })),
  };
}

export function planningFileName(p: GroupPlanning, audience: PlanningAudience, ext: "pdf" | "csv" | "ics"): string {
  return `planning_${slug(p.name)}_${audience === "financeur" ? "financeur" : "apprenants"}.${ext}`;
}

// ── CSV (financeur / tableur) ────────────────────────────────────────────────
export function buildPlanningCsv(p: GroupPlanning): string {
  const lines = ["Date;Jour;Début;Fin;Durée (h);Salle;Formatrice;Statut;Cumul (h)"];
  let cumul = 0;
  for (const s of p.sessions) {
    const h = hoursOf(s);
    if (s.status !== "annulee") cumul += h;
    lines.push([
      fmtDay(localDate(s.startsAt), { day: "2-digit", month: "2-digit", year: "numeric" }),
      fmtDay(localDate(s.startsAt), { weekday: "long" }),
      localTime(s.startsAt), localTime(s.endsAt), String(h).replace(".", ","),
      s.roomName ?? p.roomName ?? "", s.trainerName ?? p.trainerName ?? "",
      s.status === "annulee" ? "Annulée" : s.status === "realisee" ? "Réalisée" : "Planifiée",
      String(Math.round(cumul * 100) / 100).replace(".", ","),
    ].join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
}

// ── Calendrier .ics (téléphone de l'apprenant, agenda du financeur) ──────────
export function buildPlanningIcs(p: GroupPlanning): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const location = [p.roomName, p.roomAddress].filter(Boolean).join(", ");
  const events = p.sessions
    .filter((s) => s.status !== "annulee")
    .map((s) => [
      "BEGIN:VEVENT",
      `UID:${s.id}@pef-erp`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(s.startsAt)}`,
      `DTEND:${stamp(s.endsAt)}`,
      `SUMMARY:${esc(`Cours de français — ${p.name}`)}`,
      ...(location ? [`LOCATION:${esc(location)}`] : []),
      `DESCRIPTION:${esc(`${ORG_LEGAL.name}${s.trainerName ?? p.trainerName ? ` · ${s.trainerName ?? p.trainerName}` : ""}`)}`,
      "END:VEVENT",
    ].join("\r\n"));
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ParlerEmploi Formation//ERP PEF//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Cours de français — ${p.name}`)}`, `X-WR-TIMEZONE:${TZ}`,
    ...events, "END:VCALENDAR", "",
  ].join("\r\n");
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function buildPlanningPdf(p: GroupPlanning, audience: PlanningAudience): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const learners = audience === "apprenants";
  const base = learners ? 10.5 : 9;
  const rowH = learners ? 17 : 14;

  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const pages: PDFPage[] = [page];
  const text = (str: string, x: number, size: number, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(str, { x, y, size, font: f, color });

  // Colonnes
  const cols = learners
    ? [{ k: "date", w: 150, l: "Date" }, { k: "time", w: 95, l: "Horaire" }, { k: "room", w: 120, l: "Salle" }, { k: "trainer", w: 130, l: "Formatrice" }]
    : [{ k: "date", w: 130, l: "Date" }, { k: "time", w: 80, l: "Horaire" }, { k: "hours", w: 45, l: "Durée" }, { k: "room", w: 85, l: "Salle" }, { k: "trainer", w: 95, l: "Formatrice" }, { k: "status", w: 60, l: "Statut" }, { k: "cumul", w: 50, l: "Cumul" }];
  const tableW = cols.reduce((n, c) => n + c.w, 0);

  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: tableW, height: rowH, color: PEF_PALE });
    let x = MARGIN + 4;
    for (const c of cols) {
      page.drawText(c.l, { x, y: y + 1, size: base - 1, font: bold, color: PEF_GREEN });
      x += c.w;
    }
    y -= rowH;
  };
  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    pages.push(page);
    y = A4.height - MARGIN;
    text(`${p.name} — planning (suite)`, MARGIN, 9, bold, PEF_GREEN);
    y -= 16;
    tableHeader();
  };
  const need = (h: number) => {
    if (y - h < MARGIN + 30) newPage();
  };

  // ── En-tête ──
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
  if (learners) {
    text(`Cours de français · ${ORG_LEGAL.phone}`, MARGIN + 110, 8, font, GRAY);
  } else {
    text(ORG_LEGAL.nda, MARGIN + 110, 8, font, GRAY);
    y -= 11;
    text(ORG_LEGAL.siret, MARGIN + 110, 8, font, GRAY);
  }
  y -= 34;

  text(learners ? "VOTRE PLANNING DE COURS" : "PLANNING PRÉVISIONNEL DES SÉANCES", MARGIN, 15, bold, PEF_GREEN);
  y -= 16;
  text(`${p.name}${p.groupNo ? ` (${groupRef(p.groupNo)})` : ""}${p.programName ? ` — ${p.programName}` : ""}`, MARGIN, 10.5, bold);
  y -= 13;
  text(`Édité le ${new Date().toLocaleDateString("fr-FR", { timeZone: TZ })}${learners ? "" : " — document prévisionnel, les séances réalisées sont attestées par les feuilles d'émargement signées"}`, MARGIN, 8, font, GRAY);
  y -= 22;

  const field = (label: string, value: string) => {
    text(label, MARGIN, base);
    text(value, MARGIN + 140, base, bold, PEF_GREEN);
    y -= base + 5;
  };
  const active = p.sessions.filter((s) => s.status !== "annulee");
  const plannedHours = Math.round(active.reduce((n, s) => n + hoursOf(s), 0) * 10) / 10;
  field("Période", `du ${fmtDay(p.startsOn)} au ${p.endsOn ? fmtDay(p.endsOn) : "—"}`);
  field("Rythme", describePattern(p.weeklyPattern) || "—");
  field(learners ? "Lieu" : "Salle", [p.roomName, p.roomAddress].filter(Boolean).join(" — ") || "—");
  field("Formatrice", p.trainerName ?? "—");
  if (!learners) field("Financeur", p.funderName ?? "—");
  field("Volume", `${plannedHours} h planifiées sur ${p.totalHours} h · ${active.length} séances`);
  field("Vacances scolaires", p.skipSchoolHolidays ? "pas de cours pendant les vacances scolaires" : "cours maintenus pendant les vacances scolaires");
  if (p.skipSchoolHolidays && p.holidays.length) {
    const list = p.holidays.map((h) => `${h.label} (du ${fmtDay(h.startsOn, { day: "numeric", month: "short" })} au ${fmtDay(h.endsOn, { day: "numeric", month: "short" })})`).join(", ");
    text(`Pas de cours : ${list}`, MARGIN, base - 1.5, font, GRAY);
    y -= base + 6;
  }
  y -= 8;

  // ── Tableau des séances, par mois ──
  tableHeader();
  let cumul = 0;
  let month = "";
  for (const s of p.sessions) {
    if (learners && s.status === "annulee") continue;
    const day = localDate(s.startsAt);
    const m = fmtDay(day, { month: "long", year: "numeric" });
    if (m !== month) {
      month = m;
      need(rowH * 2);
      text(m.charAt(0).toUpperCase() + m.slice(1), MARGIN + 4, base, bold, PEF_EMERALD);
      y -= rowH;
    }
    need(rowH);
    const h = hoursOf(s);
    if (s.status !== "annulee") cumul += h;
    const cancelled = s.status === "annulee";
    const color = cancelled ? RED : rgb(0, 0, 0);
    const values: Record<string, string> = {
      date: fmtDay(day, { weekday: "long", day: "numeric", month: "long" }),
      time: `${localTime(s.startsAt)} – ${localTime(s.endsAt)}`,
      hours: `${h} h`,
      room: s.roomName ?? p.roomName ?? "—",
      trainer: s.trainerName ?? p.trainerName ?? "—",
      status: cancelled ? "Annulée" : s.status === "realisee" ? "Réalisée" : "Planifiée",
      cumul: `${Math.round(cumul * 10) / 10} h`,
    };
    let x = MARGIN + 4;
    for (const c of cols) {
      const v = values[c.k] ?? "";
      const size = base - (c.k === "date" ? 0 : 0.5);
      let str = v;
      while (str.length > 3 && (c.k === "date" ? bold : font).widthOfTextAtSize(str, size) > c.w - 8) str = str.slice(0, -2) + "…";
      page.drawText(str, { x, y, size, font: c.k === "date" ? bold : font, color: c.k === "date" ? color : cancelled ? RED : rgb(0.15, 0.15, 0.15) });
      x += c.w;
    }
    page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: MARGIN + tableW, y: y - 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    y -= rowH;
  }

  // ── Pied ──
  y -= 10;
  need(40);
  if (learners) {
    text("Merci d'arriver 10 minutes avant le début du cours. Si vous ne pouvez pas venir, prévenez-nous :", MARGIN, base - 1, font, GRAY);
    y -= base + 3;
    text(`${ORG_LEGAL.phone} (appel ou WhatsApp). Ce planning peut évoluer : nous vous préviendrons de tout changement.`, MARGIN, base - 1, font, GRAY);
  } else {
    text("Planning prévisionnel établi par l'organisme. Les heures réalisées sont justifiées par les feuilles d'émargement signées", MARGIN, 7.5, font, GRAY);
    y -= 10;
    text("(horodatées, contre-signées par la formatrice) et récapitulées dans le bilan remis au financeur.", MARGIN, 7.5, font, GRAY);
  }
  // numéros de page
  pages.forEach((pg, i) => {
    pg.drawText(`${p.name} · page ${i + 1} / ${pages.length}`, { x: A4.width - MARGIN - 160, y: 28, size: 7.5, font, color: GRAY });
  });
  return doc.save();
}

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { LOGO_PEF_BASE64 } from "@/lib/emargement/logo-data";
import { groupRef } from "@/lib/refs";
import {
  PLANNING_THEME,
  buildPlanningPdf,
  describePattern,
  fmtDay,
  hoursOf,
  icsEvents,
  localDate,
  localTime,
  slug,
  wrapIcs,
  type GroupPlanning,
  type PlanningAudience,
} from "@/lib/reports/group-planning";

// Plannings groupés, à télécharger d'un coup :
//   • pour un FINANCEUR : tous ses groupes en cours (page de garde récapitulative + le
//     planning prévisionnel de chaque groupe) ;
//   • pour un APPRENANT : les groupes où il est inscrit (version apprenants) ;
//   • pour l'ACCUEIL : tous les groupes en cours (affichage / impression de la rentrée).
// PDF = page de garde + concaténation des plannings de groupe ; CSV et .ics = union.

const { PEF_GREEN, PEF_EMERALD, PEF_PALE, GRAY, A4, MARGIN, TZ, ORG_LEGAL } = PLANNING_THEME;

export type PlanningBundle = {
  title: string; // « Plannings des groupes financés », « Vos plannings de cours »…
  subtitle: string | null; // financeur, apprenant, saison…
  audience: PlanningAudience;
  plannings: GroupPlanning[];
  cover?: boolean; // page de garde (par défaut : oui dès qu'il y a plus d'un groupe)
};

export type PlanningSummary = {
  name: string;
  ref: string | null;
  program: string | null;
  pattern: string[]; // une ligne par créneau hebdomadaire
  period: string;
  room: string;
  trainer: string;
  hours: number; // heures planifiées (séances non annulées)
  sessions: number;
};

/** Résumé d'un groupe pour la page de garde (pur, testé). */
export function summarizePlanning(p: GroupPlanning): PlanningSummary {
  const active = p.sessions.filter((s) => s.status !== "annulee");
  const pattern = describePattern(p.weeklyPattern, "|");
  return {
    name: p.name,
    ref: p.groupNo ? groupRef(p.groupNo) : null,
    program: p.programName,
    pattern: pattern ? pattern.split("|") : ["—"],
    period: `${fmtDay(p.startsOn, { day: "2-digit", month: "2-digit", year: "numeric" })} → ${p.endsOn ? fmtDay(p.endsOn, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}`,
    room: p.roomName ?? "—",
    trainer: p.trainerName ?? "—",
    hours: Math.round(active.reduce((n, s) => n + hoursOf(s), 0) * 10) / 10,
    sessions: active.length,
  };
}

export function bundleFileName(bundle: Pick<PlanningBundle, "subtitle" | "audience" | "title">, ext: "pdf" | "csv" | "ics"): string {
  const base = slug(bundle.subtitle ?? bundle.title) || "plannings";
  return `plannings_${base}_${bundle.audience === "financeur" ? "financeur" : "apprenants"}.${ext}`;
}

// ── CSV : une ligne par séance, tous groupes confondus (colonne Groupe en tête) ──
export function buildBundleCsv(plannings: GroupPlanning[]): string {
  const lines = ["Groupe;Dispositif;Date;Jour;Début;Fin;Durée (h);Salle;Formatrice;Statut;Cumul groupe (h)"];
  for (const p of plannings) {
    let cumul = 0;
    for (const s of p.sessions) {
      const h = hoursOf(s);
      if (s.status !== "annulee") cumul += h;
      lines.push([
        p.name,
        p.programName ?? "",
        fmtDay(localDate(s.startsAt), { day: "2-digit", month: "2-digit", year: "numeric" }),
        fmtDay(localDate(s.startsAt), { weekday: "long" }),
        localTime(s.startsAt),
        localTime(s.endsAt),
        String(h).replace(".", ","),
        s.roomName ?? p.roomName ?? "",
        s.trainerName ?? p.trainerName ?? "",
        s.status === "annulee" ? "Annulée" : s.status === "realisee" ? "Réalisée" : "Planifiée",
        String(Math.round(cumul * 100) / 100).replace(".", ","),
      ].join(";"));
    }
  }
  return "﻿" + lines.join("\r\n");
}

// ── .ics : toutes les séances de tous les groupes dans un seul calendrier ──
export function buildBundleIcs(plannings: GroupPlanning[], calendarName: string): string {
  return wrapIcs(calendarName, plannings.flatMap(icsEvents));
}

// ── PDF ──
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const pg of pages) out.addPage(pg);
  }
  return out.save();
}

async function buildCoverPdf(bundle: PlanningBundle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const learners = bundle.audience === "apprenants";
  const base = 9;
  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;
  const pages = [page];
  const text = (str: string, x: number, size: number, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(str, { x, y, size, font: f, color });
  const fit = (str: string, w: number, size: number, f: PDFFont = font) => {
    let s = str;
    while (s.length > 3 && f.widthOfTextAtSize(s, size) > w - 8) s = s.slice(0, -2) + "…";
    return s;
  };

  // En-tête (même charte que le planning de groupe)
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
  if (learners) text(`Cours de français · ${ORG_LEGAL.phone}`, MARGIN + 110, 8, font, GRAY);
  else {
    text(ORG_LEGAL.nda, MARGIN + 110, 8, font, GRAY);
    y -= 11;
    text(ORG_LEGAL.siret, MARGIN + 110, 8, font, GRAY);
  }
  y -= 34;

  text(bundle.title.toUpperCase(), MARGIN, 15, bold, PEF_GREEN);
  y -= 16;
  if (bundle.subtitle) {
    text(bundle.subtitle, MARGIN, 10.5, bold);
    y -= 13;
  }
  const summaries = bundle.plannings.map(summarizePlanning);
  const totalHours = Math.round(summaries.reduce((n, s) => n + s.hours, 0) * 10) / 10;
  text(
    `Édité le ${new Date().toLocaleDateString("fr-FR", { timeZone: TZ })} · ${summaries.length} groupe${summaries.length > 1 ? "s" : ""} · ${totalHours} h planifiées${learners ? "" : " — document prévisionnel, les séances réalisées sont attestées par les feuilles d'émargement signées"}`,
    MARGIN, 8, font, GRAY,
  );
  y -= 24;

  // Tableau récapitulatif
  const cols = [
    { k: "name", w: 135, l: "Groupe" },
    { k: "pattern", w: 125, l: "Jours et horaires" },
    { k: "period", w: 95, l: "Période" },
    { k: "room", w: 65, l: "Salle" },
    { k: "trainer", w: 75, l: "Formatrice" },
  ];
  const tableW = cols.reduce((n, c) => n + c.w, 0);
  const lineH = 11;
  const header = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: tableW, height: 15, color: PEF_PALE });
    let x = MARGIN + 4;
    for (const c of cols) {
      page.drawText(c.l, { x, y: y + 1, size: base - 1, font: bold, color: PEF_GREEN });
      x += c.w;
    }
    y -= 17;
  };
  header();
  for (const s of summaries) {
    const nameLines = [s.ref ? `${s.name} (${s.ref})` : s.name, ...(s.program ? [s.program] : []), `${s.hours} h · ${s.sessions} séances`];
    const rowLines = Math.max(nameLines.length, s.pattern.length, 1);
    const rowH = rowLines * lineH + 6;
    if (y - rowH < MARGIN + 30) {
      page = doc.addPage([A4.width, A4.height]);
      pages.push(page);
      y = A4.height - MARGIN;
      text(`${bundle.title} (suite)`, MARGIN, 9, bold, PEF_GREEN);
      y -= 16;
      header();
    }
    const top = y;
    const cell = (x: number, w: number, lines: string[], firstBold = false) => {
      let yy = top;
      lines.forEach((ln, i) => {
        const f = firstBold && i === 0 ? bold : font;
        const color = firstBold && i === 0 ? rgb(0, 0, 0) : i === 0 ? rgb(0.15, 0.15, 0.15) : GRAY;
        page.drawText(fit(ln, w, base - (i === 0 ? 0 : 1), f), { x, y: yy, size: base - (i === 0 ? 0 : 1), font: f, color });
        yy -= lineH;
      });
    };
    let x = MARGIN + 4;
    cell(x, cols[0].w, nameLines, true); x += cols[0].w;
    cell(x, cols[1].w, s.pattern); x += cols[1].w;
    cell(x, cols[2].w, [s.period]); x += cols[2].w;
    cell(x, cols[3].w, [s.room]); x += cols[3].w;
    cell(x, cols[4].w, [s.trainer]);
    y -= rowH;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: MARGIN + tableW, y: y + 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
  }

  y -= 12;
  text(
    learners
      ? "Le planning détaillé de chaque groupe (dates séance par séance, lieu, comment trouver la salle) suit dans les pages suivantes."
      : "Le planning prévisionnel détaillé de chaque groupe (séances, durées, cumul, statut) suit dans les pages suivantes.",
    MARGIN, base - 1, font, GRAY,
  );
  pages.forEach((pg, i) => {
    pg.drawText(`Sommaire · page ${i + 1} / ${pages.length}`, { x: A4.width - MARGIN - 160, y: 28, size: 7.5, font, color: GRAY });
  });
  // Petite touche : trait émeraude sous le titre
  pages[0].drawLine({ start: { x: MARGIN, y: A4.height - MARGIN - 98 }, end: { x: MARGIN + 60, y: A4.height - MARGIN - 98 }, thickness: 2, color: PEF_EMERALD });
  return doc.save();
}

export async function buildBundlePdf(bundle: PlanningBundle): Promise<Uint8Array> {
  const withCover = bundle.cover ?? bundle.plannings.length > 1;
  const parts: Uint8Array[] = [];
  if (withCover) parts.push(await buildCoverPdf(bundle));
  for (const p of bundle.plannings) parts.push(await buildPlanningPdf(p, bundle.audience));
  return parts.length === 1 ? parts[0] : mergePdfs(parts);
}

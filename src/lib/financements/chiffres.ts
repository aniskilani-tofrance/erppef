import {
  computeFunderReport,
  loadFunderReportData,
  UNKNOWN_LABEL,
  type Distribution,
  type FunderReport,
  type FunderReportData,
} from "@/lib/reports/funder-report";
import { createAdminClient } from "@/lib/supabase/admin";

// Chiffres de l'ERP pour un dossier de financement (lot 2) : uniquement des TOTAUX sur
// toute l'organisation, pour une période. Jamais de nom, jamais de ligne par personne,
// et jamais la répartition RQTH (donnée sensible : elle ne va pas dans un dossier).
// On réutilise tel quel le calcul des bilans financeurs (une seule façon de compter).

export type FigurePeriod = { key: string; label: string; from: string; to: string };

// Périodes proposées, d'après la date du jour (AAAA-MM-JJ). L'année de formation va de
// septembre à août.
export function figurePeriods(today: string): FigurePeriod[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = m >= 9 ? y : y - 1;
  return [
    { key: "formation", label: `Année de formation ${start}-${start + 1}`, from: `${start}-09-01`, to: `${start + 1}-08-31` },
    { key: "annee", label: `Année civile ${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
    { key: "formation_precedente", label: `Année de formation ${start - 1}-${start}`, from: `${start - 1}-09-01`, to: `${start}-08-31` },
    { key: "annee_precedente", label: `Année civile ${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

export function periodByKey(key: string | null | undefined, today: string): FigurePeriod {
  const all = figurePeriods(today);
  return all.find((p) => p.key === key) ?? all[0];
}

// Réunit les données de plusieurs financeurs en un seul jeu : un groupe n'a qu'un
// financeur (rien à dédoublonner), mais une personne peut suivre deux groupes de
// financeurs différents (elle n'est comptée qu'une fois).
export function mergeReportData(parts: FunderReportData[], label: string, from: string, to: string): FunderReportData {
  const learners = new Map<string, FunderReportData["learners"][number]>();
  for (const p of parts) for (const l of p.learners) learners.set(l.id, l);
  return {
    funderName: label,
    from,
    to,
    groups: parts.flatMap((p) => p.groups),
    sessions: parts.flatMap((p) => p.sessions),
    enrollments: parts.flatMap((p) => p.enrollments),
    learners: [...learners.values()],
    attendanceRecords: parts.flatMap((p) => p.attendanceRecords),
    evaluations: parts.flatMap((p) => p.evaluations ?? []),
  };
}

const nf = (n: number) => n.toLocaleString("fr-FR");
const plural = (n: number, one: string, many: string) => `${nf(n)} ${n > 1 ? many : one}`;

// « Femmes 32, Hommes 14 » : les plus gros effectifs d'abord, « Non renseigné » à la fin.
function distLine(d: Distribution, max = 6): string | null {
  const known = d.filter((x) => x.count > 0 && x.label !== UNKNOWN_LABEL).sort((a, b) => b.count - a.count);
  if (!known.length) return null;
  const unknown = d.find((x) => x.label === UNKNOWN_LABEL)?.count ?? 0;
  const shown = known.slice(0, max).map((x) => `${x.label} ${nf(x.count)}`);
  const rest = known.slice(max).reduce((n, x) => n + x.count, 0);
  if (rest > 0) shown.push(`autres ${nf(rest)}`);
  if (unknown > 0) shown.push(`non renseigné ${nf(unknown)}`);
  return shown.join(", ");
}

// Les chiffres en lignes de texte simple, prêtes à être insérées dans une rubrique ou
// données à l'IA. Vide si aucune activité sur la période.
export function figuresLines(report: FunderReport): string[] {
  const t = report.totals;
  if (!t.uniqueLearners && !t.sessionsDone && !t.groupCount) return [];
  const lines: string[] = [];
  lines.push(`${plural(t.uniqueLearners, "personne accompagnée", "personnes accompagnées")}, dans ${plural(t.groupCount, "groupe", "groupes")}`);
  if (t.hoursDone > 0) lines.push(`${nf(t.hoursDone)} heures de formation réalisées (${plural(t.sessionsDone, "séance", "séances")})`);
  if (t.hoursPlanned > 0) lines.push(`${nf(t.hoursPlanned)} heures encore prévues sur la période`);
  if (t.averageAttendanceRate !== null) lines.push(`Taux de présence moyen : ${t.averageAttendanceRate} %`);
  if (t.exits.termine || t.exits.abandon) {
    lines.push(`Parcours terminés : ${nf(t.exits.termine)} ; abandons : ${nf(t.exits.abandon)}`);
  }
  const d = report.distributions;
  const add = (label: string, dist: Distribution, max?: number) => {
    const line = distLine(dist, max);
    if (line) lines.push(`${label} : ${line}`);
  };
  add("Sexe", d.gender);
  add("Âge", d.age);
  add("Quartier prioritaire (QPV)", d.qpv);
  add("Situation", d.activity);
  add("Scolarisation", d.education);
  add("Communes", d.cities, 5);
  add("Quartiers", d.districts, 6);
  const a = report.acquis;
  if (a && a.evaluated > 0) {
    add(`Niveau atteint en fin de parcours (${plural(a.evaluated, "personne évaluée", "personnes évaluées")})`, a.levels);
    if (a.compared > 0) lines.push(`Progression : ${nf(a.progressed)} sur ${nf(a.compared)} ont gagné au moins un niveau`);
  }
  return lines;
}

export function figuresText(report: FunderReport, periodLabel: string): string {
  const lines = figuresLines(report);
  if (!lines.length) return "";
  return [`Chiffres de l'ERP — ${periodLabel} :`, ...lines.map((l) => `- ${l}`)].join("\n");
}

// Charge les totaux de toute l'organisation sur la période. À appeler APRÈS requireRole
// (client de service, org_id explicite partout — même règle que les bilans).
export async function loadOrgFigures(orgId: string, from: string, to: string): Promise<FunderReport> {
  const supabase = createAdminClient();
  const { data: groups } = await supabase
    .from("groups")
    .select("funder_id")
    .eq("org_id", orgId)
    .lte("starts_on", to)
    .or(`ends_on.gte.${from},ends_on.is.null`);
  const funderIds = [...new Set((groups ?? []).map((g) => g.funder_id as string | null).filter((id): id is string => !!id))];
  const parts: FunderReportData[] = [];
  for (const funderId of funderIds) {
    const data = await loadFunderReportData(orgId, funderId, from, to);
    if (data) parts.push(data);
  }
  return computeFunderReport(mergeReportData(parts, "Toute l'association", from, to));
}

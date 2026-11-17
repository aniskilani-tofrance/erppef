import { localToUtc, utcToLocalDate, isoWeekday } from "@/lib/dates";
import type { DeadlineKind } from "./constants";

// Calculs de dates du module Financements. Tout est fait en JOURS CALENDAIRES de Paris
// (jamais en tranches de 24 h sur de l'UTC : passage à l'heure d'hiver, échéances à 23h59).

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parisDay(at: Date | string): string {
  return utcToLocalDate(typeof at === "string" ? at : at.toISOString());
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Nombre de jours calendaires (Paris) entre aujourd'hui et l'échéance : 0 = aujourd'hui,
// 1 = demain, -2 = il y a deux jours.
export function daysUntil(dueAt: string, now: Date = new Date()): number {
  const a = Date.parse(`${parisDay(now)}T12:00:00Z`);
  const b = Date.parse(`${parisDay(dueAt)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type Urgency = "retard" | "rouge" | "orange" | "vert";

// Pastille de la frise : rouge à moins de 15 jours, orange à moins de 30, verte au-delà ;
// une échéance dépassée et non faite est « en retard » (rouge, signalée à part).
export function urgencyOf(days: number): Urgency {
  if (days < 0) return "retard";
  if (days < 15) return "rouge";
  if (days < 30) return "orange";
  return "vert";
}

export const URGENCY_CLASSES: Record<Urgency, { dot: string; text: string; label: string }> = {
  retard: { dot: "bg-red-600 ring-2 ring-red-200", text: "text-red-700", label: "En retard" },
  rouge: { dot: "bg-red-500", text: "text-red-700", label: "Moins de 15 jours" },
  orange: { dot: "bg-orange-400", text: "text-orange-700", label: "Moins de 30 jours" },
  vert: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Plus de 30 jours" },
};

export function relativeLabel(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  if (days < 0) return `il y a ${-days} jours`;
  return `dans ${days} jours`;
}

// Saisie « date + heure facultative » (heure de Paris) → instant ISO. Sans heure, l'échéance
// tombe à 23h59 : c'est l'usage des plateformes de dépôt (« avant minuit »).
export function deadlineFromInput(day: string | null | undefined, time?: string | null): string | null {
  const d = (day ?? "").trim();
  if (!d) return null;
  if (!DAY_RE.test(d)) throw new Error("date attendue au format AAAA-MM-JJ");
  const t = (time ?? "").trim() || "23:59";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error("heure attendue au format HH:MM");
  return localToUtc(d, t);
}

// Inverse : instant ISO → { day, time } à l'heure de Paris (pour préremplir un formulaire).
export function inputFromDeadline(iso: string | null | undefined): { day: string; time: string } {
  if (!iso) return { day: "", time: "" };
  const day = parisDay(iso);
  const time = new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return { day, time };
}

// ── Filtre « échéance » de la veille ─────────────────────────────────────────
export const DEADLINE_FILTERS = ["semaine", "mois", "plus_tard", "sans_date", "passee"] as const;
export type DeadlineFilter = (typeof DEADLINE_FILTERS)[number];
export const DEADLINE_FILTER_LABELS: Record<DeadlineFilter, string> = {
  semaine: "Cette semaine",
  mois: "Ce mois-ci",
  plus_tard: "Plus tard",
  sans_date: "Sans date",
  passee: "Date passée",
};

export function endOfWeek(day: string): string {
  return addDays(day, 7 - isoWeekday(day)); // dimanche
}
export function endOfMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)); // jour 0 du mois suivant
  return last.toISOString().slice(0, 10);
}

// « Ce mois-ci » englobe « cette semaine » (on cherche ce qui tombe d'ici la fin du mois).
export function matchesDeadlineFilter(filter: DeadlineFilter, deadlineAt: string | null, now: Date = new Date()): boolean {
  if (filter === "sans_date") return !deadlineAt;
  if (!deadlineAt) return false;
  const today = parisDay(now);
  const d = parisDay(deadlineAt);
  switch (filter) {
    case "passee":
      return d < today;
    case "semaine":
      return d >= today && d <= endOfWeek(today);
    case "mois":
      return d >= today && d <= endOfMonth(today);
    case "plus_tard":
      return d > endOfMonth(today);
  }
}

// ── Frise de « Ma semaine » ──────────────────────────────────────────────────
export type DeadlineLike = {
  id: string;
  due_at: string;
  done_at: string | null;
  kind: DeadlineKind;
  title: string;
  reminder_days?: number[] | null;
};

// Les échéances non faites des `horizon` prochains jours, plus celles en retard (jusqu'à
// `overdueWindow` jours en arrière), triées par date.
export function timeline<T extends DeadlineLike>(
  deadlines: T[],
  now: Date = new Date(),
  horizon = 30,
  overdueWindow = 60,
): (T & { days: number; urgency: Urgency })[] {
  return deadlines
    .filter((d) => !d.done_at)
    .map((d) => {
      const days = daysUntil(d.due_at, now);
      return { ...d, days, urgency: urgencyOf(days) };
    })
    .filter((d) => d.days <= horizon && d.days >= -overdueWindow)
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.title.localeCompare(b.title, "fr"));
}

// Mois affichés par le calendrier (vue liste) : `count` mois à partir du mois de `day`.
export function monthsFrom(day: string, count: number): string[] {
  const [y, m] = day.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

// Grille d'un mois (vue mois) : semaines du lundi au dimanche, jours hors mois inclus.
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, 1 - isoWeekday(first));
  const last = endOfMonth(first);
  const end = addDays(last, 7 - isoWeekday(last));
  const weeks: string[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return weeks;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function isMonthParam(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

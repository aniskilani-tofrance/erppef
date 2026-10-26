import { utcToLocalTime } from "@/lib/dates";
import type { MeetingWhen } from "@/lib/admission/messages";

// Heure de convocation propre à chaque personne (info_meeting_invitations.convocation_at) :
// la réunion a une date et une heure, mais chaque convoqué peut arriver à son heure (test
// oral échelonné). Fichier pur : serveur et client.

export const MIN_STEP_MINUTES = 5;
export const MAX_STEP_MINUTES = 120;

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** « 14:20 » → 860 (minutes depuis minuit) ; null si ce n'est pas une heure. */
export function parseClock(time: string): number | null {
  const m = CLOCK.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** « 14h20 » pour un instant ISO (heure de Paris). */
export function clockLabel(iso: string): string {
  return utcToLocalTime(iso).replace(":", "h");
}

export const MAX_PARALLEL = 20;

/**
 * Heures espacées : la première à `first`, puis une toutes les `stepMinutes` minutes, pour `count`
 * personnes, `parallel` à la fois (nombre d'accueillants : 3 → trois personnes à 17h00, trois à
 * 17h10…). Refuse un pas hors limites et une liste qui déborderait sur le lendemain.
 */
export function spreadTimes(
  first: string,
  stepMinutes: number,
  count: number,
  parallel: number = 1,
): { ok: true; times: string[] } | { ok: false; error: string } {
  const start = parseClock(first);
  if (start === null) return { ok: false, error: "Heure de départ invalide." };
  if (!Number.isInteger(stepMinutes) || stepMinutes < MIN_STEP_MINUTES || stepMinutes > MAX_STEP_MINUTES) {
    return { ok: false, error: `Un créneau dure entre ${MIN_STEP_MINUTES} et ${MAX_STEP_MINUTES} minutes.` };
  }
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > MAX_PARALLEL) {
    return { ok: false, error: `Entre 1 et ${MAX_PARALLEL} personnes accueillies en même temps.` };
  }
  const last = start + stepMinutes * Math.max(0, Math.ceil(count / parallel) - 1);
  if (last > 23 * 60 + 59) return { ok: false, error: "Les heures dépassent minuit : réduisez la durée par personne ou avancez le départ." };
  return { ok: true, times: Array.from({ length: count }, (_, i) => formatClock(start + stepMinutes * Math.floor(i / parallel))) };
}

// ── Accueil échelonné d'une réunion (info_meetings.stagger_minutes / stagger_parallel) ──────────
// Une arrivée toutes les `minutes` minutes, `parallel` personnes accueillies en même temps. Chaque
// inscrit par le lien reçoit la première heure libre (fonction SQL, 0058).

/** Personnes reçues par heure : 10 minutes et 3 accueillants → 18 (6 par accueillant). */
export function staggerPerHour(minutes: number, parallel: number): number {
  return Math.floor(60 / minutes) * parallel;
}

/**
 * Places que permet l'accueil entre le début et la fin de la réunion : 17h00–19h00, une arrivée
 * toutes les 10 minutes, 3 en même temps → 12 heures d'arrivée × 3 = 36. null si la fin n'est pas connue.
 */
export function staggerCapacity(startTime: string, endTime: string | null, minutes: number, parallel: number): number | null {
  const start = parseClock(startTime);
  const end = endTime ? parseClock(endTime) : null;
  if (start === null || end === null || end <= start || minutes < MIN_STEP_MINUTES) return null;
  return Math.floor((end - start) / minutes) * Math.max(1, parallel);
}

/** Dernière heure d'arrivée pour `capacity` places : 30 places, 10 minutes, 3 en même temps, 17h00 → « 18:30 ». */
export function staggerLastArrival(startTime: string, minutes: number, parallel: number, capacity: number): string | null {
  const start = parseClock(startTime);
  if (start === null || capacity < 1) return null;
  const last = start + minutes * (Math.ceil(capacity / Math.max(1, parallel)) - 1);
  return last > 23 * 60 + 59 ? null : formatClock(last);
}

/** « Une arrivée toutes les 10 min, 3 en même temps (18 par heure) ». */
export function staggerSummary(minutes: number, parallel: number): string {
  return `Une arrivée toutes les ${minutes} min, ${parallel} en même temps (${staggerPerHour(minutes, parallel)} par heure)`;
}

export type SpacingOrder = "inscription" | "alphabetique";

/** Ordre de passage : par ordre d'inscription (arrivée dans la liste) ou par nom. Stable et sans mutation. */
export function orderForSpacing<T extends { id: string; createdAt: string; lastName: string; firstName: string }>(
  rows: readonly T[],
  order: SpacingOrder,
): T[] {
  const byName = (a: T, b: T) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr") || a.id.localeCompare(b.id);
  const byArrival = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || byName(a, b);
  return [...rows].sort(order === "alphabetique" ? byName : byArrival);
}

/**
 * Quand la personne doit venir : son heure de convocation si elle en a une, sinon celle de la
 * réunion. La fin de la réunion ne vaut plus pour une heure individuelle (« jusqu'à… » retiré).
 */
export function whenForInvitation(meeting: MeetingWhen, convocationAt: string | null | undefined): MeetingWhen {
  return convocationAt ? { ...meeting, startsAt: convocationAt, endsAt: null } : meeting;
}

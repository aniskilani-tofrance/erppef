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

/**
 * Heures espacées : la première à `first`, puis une toutes les `stepMinutes` minutes, pour
 * `count` personnes. Refuse un pas hors limites et une liste qui déborderait sur le lendemain.
 */
export function spreadTimes(
  first: string,
  stepMinutes: number,
  count: number,
): { ok: true; times: string[] } | { ok: false; error: string } {
  const start = parseClock(first);
  if (start === null) return { ok: false, error: "Heure de départ invalide." };
  if (!Number.isInteger(stepMinutes) || stepMinutes < MIN_STEP_MINUTES || stepMinutes > MAX_STEP_MINUTES) {
    return { ok: false, error: `Un créneau dure entre ${MIN_STEP_MINUTES} et ${MAX_STEP_MINUTES} minutes.` };
  }
  const last = start + stepMinutes * Math.max(0, count - 1);
  if (last > 23 * 60 + 59) return { ok: false, error: "Les heures dépassent minuit : réduisez la durée par personne ou avancez le départ." };
  return { ok: true, times: Array.from({ length: count }, (_, i) => formatClock(start + stepMinutes * i)) };
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

import { localToUtc, utcToLocalDate, utcToLocalTime } from "@/lib/dates";

// Séance annulée APRÈS le rappel de la veille : les apprenants ont reçu « vous avez cours
// demain » ; on les prévient par e-mail que le cours n'a pas lieu. Fonctions pures, testées.
//
// Le rappel part avec le cron des alertes (vercel.json « 30 5 * * * », 5 h 30 UTC) la veille
// de la séance (jour de Paris), seulement pour les groupes qui ont activé les rappels.

export const REMINDER_TIME_UTC = "05:30";

const dayBefore = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Le rappel de cette séance est-il déjà parti, alors qu'elle n'a pas encore commencé ? */
export function reminderAlreadySent(startsAt: string, now: Date = new Date()): boolean {
  const sentAt = new Date(`${dayBefore(utcToLocalDate(startsAt))}T${REMINDER_TIME_UTC}:00Z`);
  return now >= sentAt && now < new Date(startsAt);
}

export type CancellationEmailInput = {
  firstName: string | null;
  startsAt: string;
  endsAt: string;
  groupName: string;
  roomName: string | null;
  now?: Date;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** E-mail court, mots simples : quel cours, qu'il est annulé, que le rappel reçu ne vaut plus. */
export function cancellationEmail(i: CancellationEmailInput): { subject: string; html: string } {
  const day = utcToLocalDate(i.startsAt);
  const today = utcToLocalDate((i.now ?? new Date()).toISOString());
  const dayLabel = new Date(localToUtc(day, "12:00")).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const when = `${day === today ? "aujourd'hui" : "demain"} ${dayLabel}`;
  const hours = `${utcToLocalTime(i.startsAt).replace(":", "h")}–${utcToLocalTime(i.endsAt).replace(":", "h")}`;
  const where = [i.groupName, i.roomName].filter(Boolean).join(", ");
  const hello = i.firstName && i.firstName !== "?" ? `Bonjour ${esc(i.firstName)},` : "Bonjour,";
  return {
    subject: `Cours annulé : ${dayLabel} à ${utcToLocalTime(i.startsAt).replace(":", "h")}`,
    html: `<p>${hello}</p>
<p>Le cours de français de <strong>${esc(when)}</strong> (${hours}, ${esc(where)}) est <strong>annulé</strong>. Ne venez pas.</p>
<p>Vous avez reçu un rappel pour ce cours : il n'a pas lieu.</p>
<p>Les autres cours continuent comme prévu.</p>
<p>L'équipe ParlerEmploi Formation</p>`,
  };
}

export function cancellationContactNote(startsAt: string): string {
  return `E-mail : cours du ${utcToLocalDate(startsAt).split("-").reverse().join("/")} à ${utcToLocalTime(startsAt).replace(":", "h")} annulé (rappel déjà reçu).`;
}

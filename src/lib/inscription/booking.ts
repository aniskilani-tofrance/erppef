// Réservation d'un créneau d'admission à la fin du formulaire d'inscription rapide :
// choix des créneaux montrés, libellés traduits, lien « Ajouter à mon agenda ».
// Fichier pur (aucun accès réseau ni base, pas de node:crypto) : client et serveur.
// Le jeton de réservation (serveur uniquement) vit dans src/lib/inscription/booking-token.ts.

import { isoWeekday } from "@/lib/dates";
import { DEFAULT_APPOINTMENT_ADDRESS } from "@/lib/admission/appointments";
import type { FreeSlot } from "@/lib/admission/slots";
import type { Availability, SignupLocale } from "@/lib/inscription/i18n";

export const PUBLIC_SLOT_COUNT = 4;
export const PUBLIC_SLOT_DAYS = 7;
export const BOOKING_ADDRESS = DEFAULT_APPOINTMENT_ADDRESS;

// Ce que reçoit l'écran de fin après une inscription réussie.
export type BookingOffer = {
  token: string; // jeton signé, 30 min, lié à la personne qui vient de s'inscrire
  slots: FreeSlot[]; // 0 à 4 créneaux ; vide → « Nous vous appelons sur WhatsApp »
  existing: FreeSlot | null; // RDV déjà prévu pour cette personne : on l'affiche
};

// ── Choix des créneaux montrés ───────────────────────────────────────────────
// Moment de la journée d'un créneau (heure de Paris), au sens des disponibilités
// déclarées dans le formulaire : matin avant 13h, après-midi jusqu'à 18h, soir après.
export function slotPeriod(time: string): Availability {
  if (time < "13:00") return "matin";
  if (time < "18:00") return "apres_midi";
  return "soir";
}

/**
 * Les 4 prochains créneaux libres dans les 7 jours. Si la personne a dit quand elle est
 * libre, ses moments passent d'abord ; on complète avec les autres s'il en manque.
 * Résultat trié par date.
 */
export function pickPublicSlots(
  slots: FreeSlot[],
  now: Date,
  { count = PUBLIC_SLOT_COUNT, days = PUBLIC_SLOT_DAYS, availability = [] as readonly string[] } = {},
): FreeSlot[] {
  const limit = now.getTime() + days * 86_400_000;
  const inWindow = [...slots]
    .filter((s) => Date.parse(s.startsAt) > now.getTime() && Date.parse(s.startsAt) < limit)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const wanted = new Set(availability);
  const preferred = wanted.size ? inWindow.filter((s) => wanted.has(slotPeriod(s.time))) : inWindow;
  const picked = preferred.slice(0, count);
  if (picked.length < count) {
    for (const s of inWindow) {
      if (picked.length >= count) break;
      if (!picked.includes(s)) picked.push(s);
    }
  }
  return picked.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// ── Libellés traduits ────────────────────────────────────────────────────────
// Tables écrites à la main (pas Intl) : même rendu partout, chiffres latins en arabe
// (comme les numéros de téléphone), majuscule au jour.
const WEEKDAY_NAMES: Record<SignupLocale, string[]> = {
  fr: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
};

const MONTH_NAMES: Record<SignupLocale, string[]> = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

/** « Mardi 21 octobre » · « Tuesday 21 October » · « الثلاثاء 21 أكتوبر » (date de Paris 'YYYY-MM-DD'). */
export function slotDayText(date: string, locale: SignupLocale): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAY_NAMES[locale][isoWeekday(date) - 1]} ${d} ${MONTH_NAMES[locale][m - 1]}`;
}

/** Heure sur 24 h : « 10h00 » en français, « 10:00 » en anglais et en arabe. */
export function slotTimeText(time: string, locale: SignupLocale): string {
  const hhmm = time.slice(0, 5);
  return locale === "fr" ? hhmm.replace(":", "h") : hhmm;
}

/** Libellé d'un bouton : « Mardi 21 octobre · 10h00 ». */
export function publicSlotLabel(slot: Pick<FreeSlot, "date" | "time">, locale: SignupLocale): string {
  return `${slotDayText(slot.date, locale)} · ${slotTimeText(slot.time, locale)}`;
}

/** Phrase de confirmation : « Rendez-vous le Mardi 21 octobre à 10h00 ». */
export function bookedSentence(slot: Pick<FreeSlot, "date" | "time">, template: string, locale: SignupLocale): string {
  return template.replace("{day}", slotDayText(slot.date, locale)).replace("{time}", slotTimeText(slot.time, locale));
}

// ── « Ajouter à mon agenda » ────────────────────────────────────────────────
// Lien « modèle d'événement » Google Agenda : s'ouvre dans l'application sur Android,
// dans le navigateur ailleurs ; aucun fichier à télécharger.
const gcalStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarTemplateUrl({
  startsAt,
  endsAt,
  title,
  details,
  location = BOOKING_ADDRESS,
}: {
  startsAt: string;
  endsAt: string;
  title: string;
  details: string;
  location?: string;
}): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${gcalStamp(startsAt)}/${gcalStamp(endsAt)}`,
    details,
    location,
    ctz: "Europe/Paris",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

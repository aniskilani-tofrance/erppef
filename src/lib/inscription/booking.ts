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

// Demi-journée d'un créneau : la date et matin / après-midi (le soir compte avec l'après-midi).
export function halfDayKey(slot: Pick<FreeSlot, "date" | "time">): string {
  return `${slot.date}:${slot.time < "13:00" ? "am" : "pm"}`;
}

/**
 * 4 créneaux libres dans les 7 jours, avec un vrai choix (si la personne ne peut pas le
 * premier jour, il en reste un autre) :
 *  1. ses moments de disponibilité d'abord, au plus 1 créneau par demi-journée ;
 *  2. au moins 2 jours différents (un créneau d'un autre jour, même hors de ses moments) ;
 *  3. on complète : ses moments jusqu'à 2 par demi-journée, puis les autres créneaux
 *     (1, puis 2 par demi-journée).
 * Résultat trié par date (ordre d'affichage).
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

  const picked: FreeSlot[] = [];
  const perHalfDay = new Map<string, number>();
  const add = (s: FreeSlot) => {
    picked.push(s);
    perHalfDay.set(halfDayKey(s), (perHalfDay.get(halfDayKey(s)) ?? 0) + 1);
  };
  const fill = (list: FreeSlot[], cap: number) => {
    for (const s of list) {
      if (picked.length >= count) return;
      if (!picked.includes(s) && (perHalfDay.get(halfDayKey(s)) ?? 0) < cap) add(s);
    }
  };

  fill(preferred, 1);
  // Au moins 2 jours différents, s'il existe un créneau un autre jour.
  const pickedDays = new Set(picked.map((s) => s.date));
  if (pickedDays.size === 1) {
    const other = inWindow.find((s) => !pickedDays.has(s.date));
    if (other) {
      if (picked.length >= count) {
        const last = picked.pop()!;
        perHalfDay.set(halfDayKey(last), (perHalfDay.get(halfDayKey(last)) ?? 1) - 1);
      }
      add(other);
    }
  }
  fill(preferred, 2);
  fill(inWindow, 1);
  fill(inWindow, 2);
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

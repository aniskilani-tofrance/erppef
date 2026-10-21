import { describe, expect, it } from "vitest";
import { freeSlots, DEFAULT_SLOT_RULES, type FreeSlot } from "@/lib/admission/slots";
import { localToUtc } from "@/lib/dates";
import {
  bookedSentence,
  googleCalendarTemplateUrl,
  halfDayKey,
  pickPublicSlots,
  publicSlotLabel,
  slotPeriod,
  slotTimeText,
} from "@/lib/inscription/booking";
import { BOOKING_TOKEN_TTL_MS, issueBookingToken, verifyBookingToken } from "@/lib/inscription/booking-token";
import { issueStamp } from "@/lib/inscription/signup";
import { SIGNUP_LOCALES, SIGNUP_TEXTS } from "@/lib/inscription/i18n";
import { isAppointmentOverlap, translatePgError } from "@/lib/pg-errors";

const ORG = "11111111-2222-4333-8444-555555555555";
const LEARNER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SECRET = "secret-de-test";
const NOW = Date.parse("2026-10-19T08:00:00.000Z"); // lundi 19 octobre, 10h00 à Paris

function slot(date: string, time: string, minutes = 30): FreeSlot {
  const startsAt = localToUtc(date, time);
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(), date, time, minutes };
}

describe("jeton de réservation", () => {
  it("aller-retour : organisme et personne", () => {
    const token = issueBookingToken({ orgId: ORG, learnerId: LEARNER }, NOW, SECRET);
    expect(verifyBookingToken(token, NOW + 60_000, SECRET)).toEqual({ orgId: ORG, learnerId: LEARNER });
  });

  it("expire au bout de 30 minutes", () => {
    const token = issueBookingToken({ orgId: ORG, learnerId: LEARNER }, NOW, SECRET);
    expect(BOOKING_TOKEN_TTL_MS).toBe(30 * 60_000);
    expect(verifyBookingToken(token, NOW + 29 * 60_000, SECRET)).not.toBeNull();
    expect(verifyBookingToken(token, NOW + 31 * 60_000, SECRET)).toBeNull();
  });

  it("refuse un autre secret, une signature ou une personne modifiées", () => {
    const token = issueBookingToken({ orgId: ORG, learnerId: LEARNER }, NOW, SECRET);
    expect(verifyBookingToken(token, NOW, "autre-secret")).toBeNull();
    const [payload, sig] = token.split(".");
    expect(verifyBookingToken(`${payload}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, NOW, SECRET)).toBeNull();
    const other = Buffer.from(`${ORG}:00000000-0000-4000-8000-000000000000:${NOW + BOOKING_TOKEN_TTL_MS}`).toString("base64url");
    expect(verifyBookingToken(`${other}.${sig}`, NOW, SECRET)).toBeNull();
  });

  it("refuse les valeurs invalides et l'horodatage anti-robot (autre usage)", () => {
    for (const bad of [null, undefined, 42, "", "abc", "a.b", "x".repeat(400)]) {
      expect(verifyBookingToken(bad, NOW, SECRET)).toBeNull();
    }
    expect(verifyBookingToken(issueStamp(NOW, SECRET), NOW, SECRET)).toBeNull();
  });
});

describe("créneaux montrés à la personne", () => {
  // Réglage par défaut : mardi 20 et jeudi 22 (10h-12h, 14h-16h), puis mardi 27 hors fenêtre.
  const all = freeSlots(DEFAULT_SLOT_RULES, [], [], new Date(NOW));
  const show = (xs: FreeSlot[]) => xs.map((s) => `${s.date.slice(8)} ${s.time}`);

  it("sans préférence : 1 par demi-journée, sur 2 jours, triés", () => {
    expect(show(pickPublicSlots([...all].reverse(), new Date(NOW)))).toEqual(["20 10:00", "20 14:00", "22 10:00", "22 14:00"]);
  });

  it("libre le matin : un matin par jour, puis complété jusqu'à 2 par matin", () => {
    expect(show(pickPublicSlots(all, new Date(NOW), { availability: ["matin"] }))).toEqual([
      "20 10:00",
      "20 10:30",
      "22 10:00",
      "22 10:30",
    ]);
  });

  it("libre l'après-midi : les après-midi des deux jours d'abord", () => {
    expect(show(pickPublicSlots(all, new Date(NOW), { availability: ["apres_midi"] }))).toEqual([
      "20 14:00",
      "20 14:30",
      "22 14:00",
      "22 14:30",
    ]);
  });

  it("jamais plus de 2 par demi-journée, au moins 2 jours", () => {
    for (const availability of [[], ["matin"], ["apres_midi"], ["soir"], ["matin", "soir"]]) {
      const picked = pickPublicSlots(all, new Date(NOW), { availability });
      expect(picked).toHaveLength(4);
      expect(new Set(picked.map((s) => s.date)).size).toBeGreaterThanOrEqual(2);
      const perHalf = new Map<string, number>();
      for (const s of picked) perHalf.set(halfDayKey(s), (perHalf.get(halfDayKey(s)) ?? 0) + 1);
      expect(Math.max(...perHalf.values())).toBeLessThanOrEqual(2);
      expect(picked.every((s) => Date.parse(s.startsAt) < NOW + 7 * 86_400_000)).toBe(true);
    }
  });

  it("préférences sur un seul jour : on ajoute un créneau d'un autre jour", () => {
    const few = [slot("2026-10-20", "18:00"), slot("2026-10-20", "18:30"), slot("2026-10-21", "10:00")];
    expect(show(pickPublicSlots(few, new Date(NOW), { availability: ["soir"] }))).toEqual(["20 18:00", "20 18:30", "21 10:00"]);
  });

  it("un seul jour disponible : 2 par demi-journée au plus, quitte à en montrer moins de 4", () => {
    const oneDay = ["10:00", "10:30", "11:00", "14:00"].map((t) => slot("2026-10-20", t));
    expect(show(pickPublicSlots(oneDay, new Date(NOW)))).toEqual(["20 10:00", "20 10:30", "20 14:00"]);
    expect(pickPublicSlots([], new Date(NOW))).toEqual([]);
  });

  it("hors fenêtre de 7 jours : ignoré", () => {
    expect(pickPublicSlots([slot("2026-10-27", "10:00")], new Date(NOW))).toEqual([]);
  });

  it("moment de la journée et demi-journée", () => {
    expect(slotPeriod("10:00")).toBe("matin");
    expect(slotPeriod("12:30")).toBe("matin");
    expect(slotPeriod("13:00")).toBe("apres_midi");
    expect(slotPeriod("18:00")).toBe("soir");
    expect(halfDayKey({ date: "2026-10-20", time: "18:00" })).toBe("2026-10-20:pm");
    expect(halfDayKey({ date: "2026-10-20", time: "09:00" })).toBe("2026-10-20:am");
  });
});

describe("libellés des créneaux par langue", () => {
  const mardi = slot("2026-10-20", "10:00");

  it("jour et date en toutes lettres, heure sur 24 h", () => {
    expect(publicSlotLabel(mardi, "fr")).toBe("Mardi 20 octobre · 10h00");
    expect(publicSlotLabel(mardi, "en")).toBe("Tuesday 20 October · 10:00");
    expect(publicSlotLabel(mardi, "ar")).toBe("الثلاثاء 20 أكتوبر · 10:00");
    expect(publicSlotLabel(slot("2026-03-01", "14:30"), "fr")).toBe("Dimanche 1 mars · 14h30");
    expect(slotTimeText("09:05:00", "fr")).toBe("09h05");
  });

  it("phrase de confirmation dans chaque langue", () => {
    expect(bookedSentence(mardi, SIGNUP_TEXTS.fr.booked, "fr")).toBe("Rendez-vous le Mardi 20 octobre à 10h00");
    expect(bookedSentence(mardi, SIGNUP_TEXTS.en.booked, "en")).toBe("Appointment on Tuesday 20 October at 10:00");
    expect(bookedSentence(mardi, SIGNUP_TEXTS.ar.booked, "ar")).toBe("موعدك يوم الثلاثاء 20 أكتوبر الساعة 10:00");
  });

  it("tous les textes de réservation existent dans les trois langues", () => {
    for (const l of SIGNUP_LOCALES) {
      const t = SIGNUP_TEXTS[l];
      for (const k of ["chooseTitle", "callMe", "booked", "keepMessage", "addToCalendar", "slotTaken", "bookingExpired"] as const) {
        expect(t[k].length, `${l}.${k}`).toBeGreaterThan(0);
      }
      expect(t.booked).toContain("{day}");
      expect(t.booked).toContain("{time}");
    }
  });
});

describe("« Ajouter à mon agenda » (lien Google Agenda)", () => {
  it("dates UTC compactes, adresse de l'organisme", () => {
    const s = slot("2026-10-20", "10:00");
    const url = new URL(googleCalendarTemplateUrl({ startsAt: s.startsAt, endsAt: s.endsAt, title: "Rendez-vous ParlerEmploi", details: "x" }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261020T080000Z/20261020T083000Z");
    expect(url.searchParams.get("location")).toBe("14 rue Alexandre Bachelet, Saint-Ouen");
    expect(url.searchParams.get("text")).toBe("Rendez-vous ParlerEmploi");
  });
});

describe("verrou en base : message clair", () => {
  const err = {
    code: "23P01",
    message: 'conflicting key value violates exclusion constraint "admission_appointments_no_overlap"',
  };
  it("reconnu, et traduit avant le message « formateur » du même code", () => {
    expect(isAppointmentOverlap(err)).toBe(true);
    expect(isAppointmentOverlap({ code: "23P01", message: "no_trainer_overlap" })).toBe(false);
    expect(isAppointmentOverlap(null)).toBe(false);
    expect(translatePgError(err)).toMatch(/autre rendez-vous d'admission est déjà prévu sur ce créneau/);
  });
});

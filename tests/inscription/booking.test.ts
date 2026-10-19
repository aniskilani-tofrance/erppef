import { describe, expect, it } from "vitest";
import { freeSlots, DEFAULT_SLOT_RULES, type FreeSlot } from "@/lib/admission/slots";
import { localToUtc } from "@/lib/dates";
import {
  bookedSentence,
  googleCalendarTemplateUrl,
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
  const all = [
    slot("2026-10-20", "10:00"),
    slot("2026-10-20", "10:30"),
    slot("2026-10-20", "11:00"),
    slot("2026-10-20", "14:00"),
    slot("2026-10-20", "14:30"),
    slot("2026-10-22", "10:00"),
    slot("2026-10-27", "10:00"), // dans 8 jours : hors fenêtre
  ];

  it("les 4 prochains, dans les 7 jours, triés", () => {
    const picked = pickPublicSlots([...all].reverse(), new Date(NOW));
    expect(picked.map((s) => `${s.date} ${s.time}`)).toEqual([
      "2026-10-20 10:00",
      "2026-10-20 10:30",
      "2026-10-20 11:00",
      "2026-10-20 14:00",
    ]);
  });

  it("les moments où la personne est libre passent d'abord, complétés au besoin", () => {
    const pm = pickPublicSlots(all, new Date(NOW), { availability: ["apres_midi"] });
    expect(pm.map((s) => s.time)).toEqual(["10:00", "10:30", "14:00", "14:30"]);
    const soir = pickPublicSlots(all, new Date(NOW), { availability: ["soir"] });
    expect(soir.map((s) => s.time)).toEqual(["10:00", "10:30", "11:00", "14:00"]);
  });

  it("moins de 4 créneaux, ou aucun", () => {
    expect(pickPublicSlots(all.slice(5), new Date(NOW))).toHaveLength(1);
    expect(pickPublicSlots([], new Date(NOW))).toEqual([]);
  });

  it("avec le calcul réel des créneaux libres (mardi et jeudi par défaut)", () => {
    const free = freeSlots(DEFAULT_SLOT_RULES, [], [], new Date(NOW));
    const picked = pickPublicSlots(free, new Date(NOW));
    expect(picked).toHaveLength(4);
    expect(picked[0]).toMatchObject({ date: "2026-10-20", time: "10:00", minutes: 30 });
    expect(picked.every((s) => Date.parse(s.startsAt) < NOW + 7 * 86_400_000)).toBe(true);
  });

  it("moment de la journée", () => {
    expect(slotPeriod("10:00")).toBe("matin");
    expect(slotPeriod("12:30")).toBe("matin");
    expect(slotPeriod("13:00")).toBe("apres_midi");
    expect(slotPeriod("18:00")).toBe("soir");
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
    expect(url.searchParams.get("location")).toBe("1 place Martin Levasseur, Saint-Ouen");
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

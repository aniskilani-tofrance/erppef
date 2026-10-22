"use client";

import { useState, useTransition } from "react";
import { bookSignupSlot, requestSignupCallback } from "@/app/inscription/actions";
import type { FreeSlot } from "@/lib/admission/slots";
import { SIGNUP_CONTACT, SIGNUP_TEXTS, type SignupLocale } from "@/lib/inscription/i18n";
import {
  BOOKING_ADDRESS,
  bookedSentence,
  googleCalendarTemplateUrl,
  publicSlotLabel,
  type BookingOffer,
} from "@/lib/inscription/booking";
import { SignupDone } from "@/components/inscription/signup-done";
import { postToHost } from "@/lib/inscription/embed";

// Écran de fin avec réservation : ✅ « Merci ! » puis « 📅 Choisissez un rendez-vous »
// (4 gros boutons), l'adresse et « 📞 Je préfère qu'on m'appelle ». Un toucher réserve ;
// la confirmation reprend le jour et l'heure, l'adresse et « Ajouter à mon agenda ».
// Sans créneau (ou sans offre) : l'écran de fin habituel, « Nous vous appelons ».

type Phase =
  | { kind: "choose"; slots: FreeSlot[]; notice: string | null }
  | { kind: "booked"; slot: FreeSlot }
  | { kind: "call"; text?: string };

function initialPhase(offer: BookingOffer | null): Phase {
  if (offer?.existing) return { kind: "booked", slot: offer.existing };
  if (offer && offer.slots.length) return { kind: "choose", slots: offer.slots, notice: null };
  return { kind: "call" };
}

function Address({ locale }: { locale: SignupLocale }) {
  const t = SIGNUP_TEXTS[locale];
  return (
    <p className="text-xl">
      <span aria-hidden>📍 </span>
      <span className="sr-only">{t.addressLabel} : </span>
      {/* Trait d'union insécable : « Saint-Ouen » ne se coupe pas en fin de ligne. */}
      <span dir="ltr" className="font-semibold">{BOOKING_ADDRESS.replace("-", "\u2011")}</span>
    </p>
  );
}

export function SignupBooking({
  locale,
  offer,
  testUrl = null,
  embed = false,
}: {
  locale: SignupLocale;
  offer: BookingOffer | null;
  testUrl?: string | null; // test de niveau à faire tout de suite (écran de fin sans créneau)
  embed?: boolean;
}) {
  const t = SIGNUP_TEXTS[locale];
  const [phase, setPhase] = useState<Phase>(() => initialPhase(offer));
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function book(slot: FreeSlot) {
    if (!offer || pending) return;
    setChosen(slot.startsAt);
    startTransition(async () => {
      const r = await bookSignupSlot({ token: offer.token, startsAt: slot.startsAt }).catch(() => ({ status: "error" as const }));
      if (r.status === "booked") {
        setPhase({ kind: "booked", slot: r.slot });
        if (embed) {
          postToHost({ type: "pef-inscription:booked" });
          postToHost({ type: "pef-inscription:step" });
        }
      } else if (r.status === "taken") {
        setPhase(r.slots.length ? { kind: "choose", slots: r.slots, notice: t.slotTaken } : { kind: "call" });
      } else if (r.status === "expired") setPhase({ kind: "call", text: t.bookingExpired });
      else setPhase((p) => (p.kind === "choose" ? { ...p, notice: t.errors.server } : p));
      setChosen(null);
    });
  }

  function callMe() {
    if (!offer || pending) return;
    startTransition(async () => {
      await requestSignupCallback({ token: offer.token }).catch(() => undefined);
      setPhase({ kind: "call" });
    });
  }

  if (phase.kind === "call") return <SignupDone locale={locale} text={phase.text} testUrl={testUrl} embed={embed} />;

  if (phase.kind === "booked") {
    const s = phase.slot;
    const calendarUrl = googleCalendarTemplateUrl({
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      title: t.calendarTitle,
      details: `${SIGNUP_CONTACT.name} — ${SIGNUP_CONTACT.phone}`,
    });
    return (
      <SignupDone locale={locale} title={bookedSentence(s, t.booked, locale)} text={null} embed={embed}>
        <Address locale={locale} />
        <p className="text-xl font-semibold">📸 {t.keepMessage}</p>
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-zinc-900 bg-white px-6 text-xl font-semibold"
        >
          🗓️ {t.addToCalendar}
        </a>
      </SignupDone>
    );
  }

  return (
    <SignupDone locale={locale} text={null} embed={embed}>
      <section className="w-full space-y-3" aria-labelledby="choisir-rdv">
        <h2 id="choisir-rdv" className="text-2xl font-bold">
          <span aria-hidden>📅 </span>
          {t.chooseTitle}
        </h2>
        {phase.notice && (
          <p role="alert" className="rounded-xl bg-amber-100 px-4 py-3 text-lg font-semibold text-amber-950">
            {phase.notice}
          </p>
        )}
        <ul className="space-y-3">
          {phase.slots.map((s) => (
            <li key={s.startsAt}>
              <button
                type="button"
                onClick={() => book(s)}
                disabled={pending}
                aria-busy={chosen === s.startsAt}
                className="flex min-h-16 w-full items-center justify-center rounded-xl bg-[#1e3a8a] px-4 py-3 text-xl font-bold text-white shadow-sm disabled:opacity-60"
              >
                {chosen === s.startsAt ? t.booking : publicSlotLabel(s, locale)}
              </button>
            </li>
          ))}
        </ul>
        <Address locale={locale} />
        <button
          type="button"
          onClick={callMe}
          disabled={pending}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-zinc-900 bg-white px-4 text-xl font-semibold disabled:opacity-60"
        >
          📞 {t.callMe}
        </button>
      </section>
    </SignupDone>
  );
}

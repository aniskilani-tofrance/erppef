import { googleCalendarTemplateUrl } from "@/lib/inscription/booking";
import { SIGNUP_CONTACT, SIGNUP_TEXTS, type SignupLocale } from "@/lib/inscription/i18n";
import { meetingCalendarEnd, meetingWhenText, type MeetingConfirmation, type PublicMeeting } from "@/lib/inscription/meeting";
import { SignupDone, SignupTestCard } from "@/components/inscription/signup-done";

// Réunion d'information collective : carte de la réunion (accueil du formulaire et écran de
// fin) et écrans de fin dédiés. Aucun hook : s'affiche côté serveur comme côté client.

const fill = (template: string, key: string, value: string) => template.replace(`{${key}}`, value);

// showWhen=false : lien commun à plusieurs créneaux, le jour et l'heure se choisissent à l'étape
// suivante ; la carte ne montre alors que le lieu et le test oral, communs à tous les créneaux.
export function MeetingCard({ meeting, locale, showWhen = true }: { meeting: PublicMeeting; locale: SignupLocale; showWhen?: boolean }) {
  const t = SIGNUP_TEXTS[locale].meeting;
  const when = meetingWhenText(meeting, locale);
  const left = meeting.placesLeft;
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 text-start ring-2 ring-[#32CF8A]">
      {showWhen && (
        <>
          <p className="text-xl font-bold text-[#00504E]">
            <span aria-hidden>📅 </span>
            {when.day}
          </p>
          <p className="text-xl font-semibold">
            <span aria-hidden>🕒 </span>
            <span dir="ltr">{when.time}</span>
            {when.until && <span className="font-normal text-zinc-600"> · {fill(t.until, "time", when.until)}</span>}
          </p>
        </>
      )}
      {meeting.place && (
        <p className="text-lg">
          <span aria-hidden>📍 </span>
          <span dir="ltr">{meeting.place.replace(/-/g, "‑")}</span>
        </p>
      )}
      {meeting.access && (
        <p className="text-lg text-zinc-700">
          <span aria-hidden>🧭 </span>
          <span dir="ltr">{meeting.access}</span>
        </p>
      )}
      {meeting.oralTest && (
        <p className="flex items-start gap-2 rounded-xl bg-[#E8F6F0] px-3 py-2 text-lg font-medium text-[#00504E]">
          <span aria-hidden>🗣️</span>
          <span>{t.oralTest}</span>
        </p>
      )}
      {meeting.state === "full" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-lg font-semibold text-amber-950 ring-1 ring-amber-200">{t.full}</p>
      )}
      {showWhen && meeting.state === "open" && left !== null && (
        <p className="text-base font-semibold text-zinc-600">
          {left === 1 ? t.placeLeftOne : fill(t.placesLeft, "n", String(left))}
        </p>
      )}
    </div>
  );
}

// Écran de fin après l'envoi du formulaire : inscrit(e) (ou déjà), ou réunion complète / fermée
// entre-temps — dans ces deux cas la fiche existe, l'équipe prévient pour la prochaine réunion.
export function SignupMeetingDone({
  locale,
  confirmation,
  testUrl = null,
  embed = false,
}: {
  locale: SignupLocale;
  confirmation: MeetingConfirmation;
  /** Lien PERSONNEL du test de niveau (créé pour la fiche de cette personne), à faire avant la réunion. */
  testUrl?: string | null;
  embed?: boolean;
}) {
  const t = SIGNUP_TEXTS[locale];
  const m = t.meeting;
  const { outcome, meeting } = confirmation;

  if (outcome === "full" || outcome === "closed") {
    return (
      <SignupDone locale={locale} title={outcome === "full" ? m.fullTitle : m.closedTitle} text={m.waitText} embed={embed} />
    );
  }

  const calendarUrl = googleCalendarTemplateUrl({
    startsAt: meeting.startsAt,
    endsAt: meetingCalendarEnd(meeting),
    title: m.calendarTitle,
    details: `${SIGNUP_CONTACT.name} — ${SIGNUP_CONTACT.phone}`,
    location: meeting.place ?? undefined,
  });
  return (
    <SignupDone locale={locale} title={outcome === "already" ? m.alreadyTitle : m.doneTitle} text={null} embed={embed}>
      {/* Le test de niveau d'abord, juste sous « Vous êtes inscrit(e) ! » : c'est la seule chose à faire
          tout de suite ; la carte de la réunion et l'agenda suivent. */}
      {testUrl && (
        <>
          <p className="text-xl font-semibold">📝 {m.testBefore}</p>
          <SignupTestCard locale={locale} testUrl={testUrl} embed={embed} />
        </>
      )}
      <div className="w-full">
        <MeetingCard meeting={{ ...meeting, state: "closed" }} locale={locale} />
      </div>
      <p className="text-xl font-semibold">📸 {t.keepMessage}</p>
      <a
        href={calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-zinc-900 bg-white px-6 text-xl font-semibold"
      >
        🗓️ {t.addToCalendar}
      </a>
      <p className="text-lg text-zinc-700">{m.cannotCome}</p>
    </SignupDone>
  );
}

// Lien fermé (réunion passée ou inscription arrêtée par l'équipe) : aucun formulaire.
export function MeetingClosedPage({ locale, embed = false }: { locale: SignupLocale; embed?: boolean }) {
  const m = SIGNUP_TEXTS[locale].meeting;
  return <SignupDone locale={locale} title={m.closedTitle} text={m.closedPage} embed={embed} />;
}

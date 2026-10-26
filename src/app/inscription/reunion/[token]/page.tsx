import type { Metadata } from "next";
import { SignupForm } from "@/components/inscription/signup-form";
import { MeetingClosedPage } from "@/components/inscription/signup-meeting";
import { SIGNUP_TEXTS, toLocale } from "@/lib/inscription/i18n";
import { isEmbedParam } from "@/lib/inscription/embed";
import { sanitizeSrc } from "@/lib/inscription/link";
import { chooseMeetingOffer } from "@/lib/inscription/meeting";
import { loadMeetingOffer } from "@/lib/inscription/meeting-server";
import { freshStamp } from "@/lib/inscription/signup";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Réunion d'information — ParlerEmploi",
  description: "Réunion d'information sur les cours de français ParlerEmploi Formation : inscription en ligne.",
  robots: { index: false, follow: false },
};

// Page PUBLIQUE d'inscription à une réunion d'information collective (test oral individuel
// inclus), envoyée par WhatsApp depuis la page de la réunion (carte « Inscription par lien »).
// Le jeton du lien est le seul secret ; la page ne montre que la date, le lieu, le test oral
// et les places restantes. Un lien commun à plusieurs créneaux propose leurs jours et heures. Paramètres facultatifs : ?lang=en|ar, ?src=…, ?embed=1 (comme
// /inscription). Réunion passée ou inscription fermée : aucun formulaire.
export default async function MeetingSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? null;
  const locale = toLocale(one("lang"));
  const embed = isEmbedParam(one("embed"));

  const loaded = await loadMeetingOffer(createAdminClient(), token);
  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center text-lg">
        <p className="text-6xl" aria-hidden>⚠️</p>
        <h1 className="text-2xl font-bold">{SIGNUP_TEXTS[locale].errors.link}</h1>
      </main>
    );
  }

  // Un créneau ou plusieurs : un lien commun à plusieurs créneaux propose leurs jours et heures.
  const offer = chooseMeetingOffer(loaded.meetings);
  if (offer.kind === "closed") return <MeetingClosedPage locale={locale} embed={embed} />;

  return (
    <SignupForm
      locale={locale}
      orgSlug={null}
      src={sanitizeSrc(one("src"))}
      stamp={freshStamp()}
      embed={embed}
      meeting={offer.kind === "single" ? offer.meeting : null}
      choices={offer.kind === "choice" ? offer.meetings : null}
    />
  );
}

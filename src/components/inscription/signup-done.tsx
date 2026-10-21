import type { ReactNode } from "react";
import { LOCALE_META, SIGNUP_CONTACT, SIGNUP_TEXTS, type SignupLocale } from "@/lib/inscription/i18n";
import { SignupShell } from "@/components/inscription/signup-shell";

// Écran de fin de l'inscription rapide : ✅ « Merci ! Nous vous appelons sur WhatsApp. »
// et le contact ParlerEmploi. `title` et `text` remplacent le remerciement (text = null :
// pas de phrase, ex. quand des créneaux sont proposés) ; `children` s'affiche entre le
// remerciement et le contact (créneaux réservables, confirmation du rendez-vous).
// `embed` : formulaire dans l'iframe du site → WhatsApp s'ouvre hors du cadre.
export function SignupDone({
  locale,
  title,
  text,
  embed = false,
  children,
}: {
  locale: SignupLocale;
  title?: string;
  text?: string | null;
  embed?: boolean;
  children?: ReactNode;
}) {
  const t = SIGNUP_TEXTS[locale];
  const phrase = text === undefined ? t.doneText : text;
  return (
    <SignupShell meta={LOCALE_META[locale]} embed={embed}>
      <div className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <p className="text-7xl" aria-hidden>✅</p>
        <h1 className="text-3xl font-bold">{title ?? t.doneTitle}</h1>
        {phrase && <p className="text-2xl">{phrase}</p>}
        {text === undefined && (
          <p className="rounded-xl bg-amber-100 px-4 py-3 text-xl font-semibold text-amber-950">
            <span aria-hidden>⚠️ </span>
            {t.doneNotice}
          </p>
        )}
        {children}
        <div className="mt-6 space-y-1 text-lg">
          <p className="font-semibold">{SIGNUP_CONTACT.name}</p>
          <p dir="ltr">📞 {SIGNUP_CONTACT.phone}</p>
        </div>
        <a
          href={`https://wa.me/${SIGNUP_CONTACT.whatsapp}`}
          {...(embed ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-2 inline-flex min-h-14 items-center gap-2 rounded-xl bg-[#14532d] px-6 text-lg font-semibold text-white"
        >
          💬 {t.doneWrite}
        </a>
      </div>
    </SignupShell>
  );
}

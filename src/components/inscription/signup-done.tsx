import type { ReactNode } from "react";
import { LOCALE_META, SIGNUP_CONTACT, SIGNUP_TEXTS, type SignupLocale } from "@/lib/inscription/i18n";
import { SignupShell } from "@/components/inscription/signup-shell";

// Écran de fin de l'inscription rapide : ✓ « Merci ! Nous vous contactons dès que
// possible », l'avertissement « votre place n'est pas encore assurée » et le contact de
// l'association. `title` et `text` remplacent le remerciement (text = null : pas de phrase,
// ex. quand des créneaux sont proposés) ; `children` s'affiche entre le remerciement et le
// contact (créneaux réservables, confirmation du rendez-vous).
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
      <div className="flex flex-col items-center gap-5 py-4 text-center" role="status">
        <span aria-hidden className="grid size-20 place-items-center rounded-full bg-[#32CF8A]/20">
          <span className="grid size-14 place-items-center rounded-full bg-[#00504E] text-3xl font-bold text-white">✓</span>
        </span>
        <h1 className="text-[2rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-signup-title),inherit]">{title ?? t.doneTitle}</h1>
        {phrase && <p className="text-2xl font-medium">{phrase}</p>}
        {text === undefined && (
          <p className="flex w-full items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-start text-xl font-semibold text-amber-950 ring-1 ring-amber-200">
            <span aria-hidden>⚠️</span>
            <span>{t.doneNotice}</span>
          </p>
        )}
        {children}
        <div className="mt-2 w-full space-y-3 rounded-2xl bg-[#F3FAF7] p-4 ring-1 ring-[#00504E]/10">
          <div className="space-y-0.5 text-lg">
            <p className="font-semibold text-[#00504E]">{SIGNUP_CONTACT.name}</p>
            <p dir="ltr" className="font-medium">📞 {SIGNUP_CONTACT.phone}</p>
          </div>
          <a
            href={`https://wa.me/${SIGNUP_CONTACT.whatsapp}`}
            {...(embed ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00504E] px-6 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] transition hover:bg-[#003D3B]"
          >
            💬 {t.doneWrite}
          </a>
        </div>
      </div>
    </SignupShell>
  );
}

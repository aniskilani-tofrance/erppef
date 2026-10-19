import type { ReactNode } from "react";
import { LOCALE_META, SIGNUP_CONTACT, SIGNUP_TEXTS, type SignupLocale } from "@/lib/inscription/i18n";
import { SignupShell } from "@/components/inscription/signup-shell";

// Écran de fin de l'inscription rapide : ✅ « Merci ! Nous vous appelons sur WhatsApp. »
// et le contact ParlerEmploi. Point d'extension : `children` s'affiche entre le
// remerciement et le contact (ex. créneaux de rendez-vous réservables).
export function SignupDone({ locale, children }: { locale: SignupLocale; children?: ReactNode }) {
  const t = SIGNUP_TEXTS[locale];
  return (
    <SignupShell meta={LOCALE_META[locale]}>
      <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
        <p className="text-7xl" aria-hidden>✅</p>
        <h1 className="text-3xl font-bold">{t.doneTitle}</h1>
        <p className="text-2xl">{t.doneText}</p>
        {children}
        <div className="mt-6 space-y-1 text-lg">
          <p className="font-semibold">{SIGNUP_CONTACT.name}</p>
          <p dir="ltr">📞 {SIGNUP_CONTACT.phone}</p>
        </div>
        <a
          href={`https://wa.me/${SIGNUP_CONTACT.whatsapp}`}
          className="mt-2 inline-flex min-h-14 items-center gap-2 rounded-xl bg-[#14532d] px-6 text-lg font-semibold text-white"
        >
          💬 {t.doneWrite}
        </a>
      </div>
    </SignupShell>
  );
}

import type { ReactNode } from "react";
import type { LOCALE_META, SignupLocale } from "@/lib/inscription/i18n";

// Cadre commun des écrans d'inscription rapide : langue et sens d'écriture (arabe : RTL),
// logo, sélecteur de langue facultatif. Grands caractères (≥ 18 px), fond clair contrasté.
export function SignupShell({
  meta,
  switcher = null,
  children,
}: {
  meta: (typeof LOCALE_META)[SignupLocale];
  switcher?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div lang={meta.htmlLang} dir={meta.dir} className="min-h-screen bg-zinc-50 text-zinc-950 [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,'Noto_Sans_Arabic',Arial,sans-serif]">
      <main className="mx-auto max-w-md space-y-6 px-4 py-5 text-lg">
        <header className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère */}
          <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
          {switcher}
        </header>
        {children}
      </main>
    </div>
  );
}

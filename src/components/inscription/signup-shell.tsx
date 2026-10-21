import type { ReactNode } from "react";
import type { LOCALE_META, SignupLocale } from "@/lib/inscription/i18n";
import { cn } from "@/lib/utils";
import { EmbedBridge } from "@/components/inscription/embed-bridge";

// Cadre commun des écrans d'inscription rapide : langue et sens d'écriture (arabe : RTL),
// logo, sélecteur de langue facultatif. Grands caractères (≥ 18 px), fond clair contrasté.
// `embed` (iframe du site, /inscription?embed=1) : ni logo ni pleine hauteur d'écran, fond
// blanc, et la hauteur est transmise à la page qui accueille le formulaire.
export function SignupShell({
  meta,
  switcher = null,
  embed = false,
  children,
}: {
  meta: (typeof LOCALE_META)[SignupLocale];
  switcher?: ReactNode;
  embed?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      lang={meta.htmlLang}
      dir={meta.dir}
      data-pef-inscription={embed ? "" : undefined}
      className={cn(
        "text-zinc-950 [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,'Noto_Sans_Arabic',Arial,sans-serif]",
        embed ? "bg-white" : "min-h-screen bg-zinc-50",
      )}
    >
      <main className="mx-auto max-w-md space-y-6 px-4 py-5 text-lg">
        {(!embed || switcher) && (
          <header className="space-y-4">
            {!embed && (
              // eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère
              <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
            )}
            {switcher}
          </header>
        )}
        {children}
      </main>
      {embed && <EmbedBridge />}
    </div>
  );
}

import type { ReactNode } from "react";
import { DM_Sans, Outfit } from "next/font/google";
import type { LOCALE_META, SignupLocale } from "@/lib/inscription/i18n";
import { cn } from "@/lib/utils";
import { EmbedBridge } from "@/components/inscription/embed-bridge";

// Polices de la charte ParlerEmploi (titres Outfit, texte DM Sans), comme le site.
// L'arabe retombe sur la police du téléphone (Noto Sans Arabic, Segoe UI…).
const titleFont = Outfit({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-signup-title" });
const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-signup-body" });

// Cadre commun des écrans d'inscription rapide : langue et sens d'écriture (arabe : RTL),
// logo, sélecteur de langue facultatif. Grands caractères (≥ 18 px), fond clair contrasté.
// Page seule : fond menthe et carte blanche. `embed` (iframe du site, /inscription?embed=1) :
// ni logo ni carte ni pleine hauteur d'écran (le site encadre déjà), et la hauteur est
// transmise à la page qui accueille le formulaire.
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
        titleFont.variable,
        bodyFont.variable,
        "text-zinc-950 antialiased [font-family:var(--font-signup-body),system-ui,-apple-system,'Segoe_UI',Roboto,'Noto_Sans_Arabic',Arial,sans-serif]",
        embed ? "bg-white" : "min-h-screen bg-[#F3FAF7]",
      )}
    >
      <main className={cn("mx-auto max-w-md text-lg", embed ? "px-4 py-5" : "space-y-5 px-4 py-6")}>
        {!embed && (
          // eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère
          <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
        )}
        <div className={cn("space-y-6", !embed && "rounded-3xl bg-white p-5 shadow-[0_12px_40px_-24px_rgba(0,80,78,0.45)] ring-1 ring-[#00504E]/10")}>
          {switcher}
          {children}
        </div>
      </main>
      {embed && <EmbedBridge />}
    </div>
  );
}

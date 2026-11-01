import type { ReactNode } from "react";
import { DM_Sans, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";

// Cadre de la page de signature aux couleurs ParlerEmploi : fond menthe, carte blanche,
// vert canard #00504E, vert vif #32CF8A, titres Outfit et texte DM Sans (comme l'inscription
// rapide et le test de niveau). Grands caractères : lisible sur un téléphone.
const titleFont = Outfit({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-sign-title" });
const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-sign-body" });

export function SigningShell({ children }: { children: ReactNode }) {
  return (
    <div
      lang="fr"
      className={cn(
        titleFont.variable,
        bodyFont.variable,
        "min-h-[100dvh] bg-[#F3FAF7] text-zinc-950 antialiased [font-family:var(--font-sign-body),system-ui,-apple-system,'Segoe_UI',Roboto,Arial,sans-serif]",
      )}
    >
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6 text-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- asset statique, page légère */}
        <img src="/logo-pef.png" alt="ParlerEmploi Formation" className="mx-auto h-12 w-auto" />
        <div className="space-y-6 rounded-3xl bg-white p-5 shadow-[0_12px_40px_-24px_rgba(0,80,78,0.45)] ring-1 ring-[#00504E]/10">{children}</div>
        <p className="text-center text-sm text-zinc-500">ParlerEmploi Formation · association loi 1901 · Saint-Ouen-sur-Seine</p>
      </main>
    </div>
  );
}

export const titleClass = "text-[1.75rem] leading-tight font-bold text-[#00504E] [font-family:var(--font-sign-title),inherit]";
export const primaryClass =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#00504E] px-6 text-xl font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] transition hover:bg-[#003D3B] active:scale-[0.99] disabled:opacity-50";
export const secondaryClass =
  "inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-zinc-200 bg-white px-5 text-lg font-semibold text-zinc-800 transition-colors hover:border-[#00504E]";

/** Page « lien invalide / expiré » : sans aucune donnée de personne. */
export function SigningUnavailable({ message }: { message: string }) {
  return (
    <SigningShell>
      <div className="space-y-3 text-center">
        <h1 className={titleClass}>Lien indisponible</h1>
        <p>{message}</p>
        <p className="text-base text-zinc-600">Pour un nouveau lien, écrivez à l&apos;équipe sur WhatsApp ou au 06 14 33 99 73.</p>
      </div>
    </SigningShell>
  );
}

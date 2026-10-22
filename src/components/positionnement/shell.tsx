import type { ReactNode } from "react";
import { DM_Sans, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";

// Cadre du test de positionnement aux couleurs ParlerEmploi : fond menthe, vert canard
// #00504E, vert vif #32CF8A, titres Outfit et texte DM Sans (comme l'inscription rapide).
// La page est en français (c'est la langue testée) ; les traductions portent leur propre
// langue et leur sens d'écriture (arabe, pachto, dari/persan : de droite à gauche).
const titleFont = Outfit({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-test-title" });
const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-test-body" });

export function TestShell({ children }: { children: ReactNode }) {
  return (
    <div
      lang="fr"
      dir="ltr"
      className={cn(
        titleFont.variable,
        bodyFont.variable,
        "min-h-[100dvh] bg-[#F3FAF7] text-zinc-950 antialiased [font-family:var(--font-test-body),system-ui,-apple-system,'Segoe_UI',Roboto,'Noto_Sans_Arabic',Arial,sans-serif]",
      )}
    >
      {children}
    </div>
  );
}

import { LANGUES_RTL } from "@/lib/positionnement/client";
import { texteFr, texteTraduit, type CleTexte } from "@/lib/positionnement/textes";
import { cn } from "@/lib/utils";

// Un texte de l'interface en français, avec dessous sa traduction (anglais, arabe) quand la
// personne a choisi cette langue : on comprend sans savoir lire le français.
export function Bilingue({
  cle,
  langue,
  prenom = "",
  className,
  traductionClassName,
}: {
  cle: CleTexte;
  langue: string;
  prenom?: string;
  className?: string;
  traductionClassName?: string;
}) {
  const t = texteTraduit(cle, langue, prenom);
  return (
    <span className={cn("flex flex-col", className)}>
      <span>{texteFr(cle, prenom)}</span>
      {t && (
        <span dir={LANGUES_RTL.includes(langue) ? "rtl" : "ltr"} lang={langue} className={cn("text-[0.85em] font-normal opacity-90", traductionClassName)}>
          {t}
        </span>
      )}
    </span>
  );
}

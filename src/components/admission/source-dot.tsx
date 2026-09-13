import {
  FAMILIES,
  resolveProvenance,
  sourceStyle,
  type ProvenanceInput,
  type SourceFamily,
} from "@/lib/admission/sources";
import { cn } from "@/lib/utils";

// Pastille de provenance : la couleur code la FAMILLE (maison de quartier, contact direct,
// prescripteur ; creuse = non renseigné), l'infobulle et le lecteur d'écran donnent le détail.
// Composants serveur, sans état.

function Dot({ color, hollow, title, className, size = "md" }: { color: string; hollow: boolean; title: string; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5", className)}
      style={hollow ? { border: `2px solid ${color}` } : { backgroundColor: color }}
    />
  );
}

/** Pastille d'un apprenant, déduite de son canal et de son prescripteur. */
export function SourceDot({ learner, className, size }: { learner: ProvenanceInput; className?: string; size?: "sm" | "md" }) {
  const p = resolveProvenance(learner);
  return <Dot color={p.color} hollow={p.hollow} title={p.title} className={className} size={size} />;
}

/** Pastille d'une famille (légendes). */
export function FamilyDot({ family, className }: { family: SourceFamily; className?: string }) {
  const f = FAMILIES[family];
  return <Dot color={f.color} hollow={f.hollow} title={`${f.label} : ${f.hint}`} className={className} />;
}

/** Pastille (couleur de la famille) + libellé du canal, pour les listes déroulantes. */
export function SourceChip({ code, className }: { code: string | null | undefined; className?: string }) {
  const style = sourceStyle(code);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Dot color={style.color} hollow={style.hollow} title={style.label} />
      <span className={style.hollow ? "text-muted-foreground" : undefined}>{style.label}</span>
    </span>
  );
}

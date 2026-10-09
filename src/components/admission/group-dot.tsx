import { FamilyDot } from "@/components/admission/source-dot";
import { FAMILIES, FAMILY_ORDER } from "@/lib/admission/sources";
import type { GroupRef } from "@/lib/admission/group-colors";
import { cn } from "@/lib/utils";

// Pastille « groupe » : la couleur de la formatrice du groupe où la personne est inscrite
// (même code que le planning). Creuse et grise tant qu'elle n'est inscrite nulle part.
// Plusieurs groupes (cours + atelier) = une pastille par groupe, trois au plus.
// Composants serveur, sans état ; utilisables aussi dans un composant client.

const NONE_COLOR = "#a1a1aa";

function Dot({ color, hollow, title, size = "md" }: { color: string; hollow: boolean; title: string; size?: "sm" | "md" }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5")}
      style={hollow ? { border: `2px solid ${color}` } : { backgroundColor: color }}
    />
  );
}

export function GroupDot({ groups, size, className }: { groups: GroupRef[]; size?: "sm" | "md"; className?: string }) {
  if (!groups.length) {
    return <span className={cn("inline-flex", className)}><Dot color={NONE_COLOR} hollow title="Pas encore inscrit·e dans un groupe" size={size} /></span>;
  }
  const shown = groups.slice(0, 3);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} title={groups.map((g) => g.name).join(" · ")}>
      {shown.map((g) => (
        <Dot key={g.id} color={g.color} hollow={false} title={`Inscrit·e : ${g.name}`} size={size} />
      ))}
      {groups.length > 3 && <span className="text-[10px] text-muted-foreground">+{groups.length - 3}</span>}
    </span>
  );
}

/** Texte compagnon de la pastille groupe (fiche, infobulles) */
export function groupsText(groups: GroupRef[]): string {
  return groups.length ? groups.map((g) => g.name).join(" · ") : "Pas encore inscrit·e";
}

/** Légende commune : les deux pastilles, familles de provenance puis groupes en cours. */
export function DotsLegend({ groups, className }: { groups: GroupRef[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-foreground">1re pastille · provenance :</span>
        {FAMILY_ORDER.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <FamilyDot family={f} />
            {FAMILIES[f].label}
          </span>
        ))}
      </span>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-foreground">2e pastille · groupe :</span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color={NONE_COLOR} hollow title="Pas encore inscrit·e" />
          pas encore inscrit·e
        </span>
        {groups.map((g) => (
          <span key={g.id} className="inline-flex items-center gap-1.5">
            <Dot color={g.color} hollow={false} title={g.name} />
            {g.name}
          </span>
        ))}
      </span>
    </div>
  );
}

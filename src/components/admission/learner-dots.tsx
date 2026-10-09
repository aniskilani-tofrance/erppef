import { SourceDot } from "@/components/admission/source-dot";
import { GroupDot, groupsText } from "@/components/admission/group-dot";
import { resolveProvenance, type ProvenanceInput } from "@/lib/admission/sources";
import type { GroupRef } from "@/lib/admission/group-colors";
import { cn } from "@/lib/utils";

// Les deux pastilles côte à côte : provenance puis groupe. `withLabels` ajoute le texte
// (fiche apprenant) ; sans, les infobulles suffisent (listes).
export function LearnerDots({
  learner,
  groups,
  withLabels = false,
  size,
  className,
}: {
  learner: ProvenanceInput;
  groups: GroupRef[];
  withLabels?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!withLabels) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <SourceDot learner={learner} size={size} />
        <GroupDot groups={groups} size={size} />
      </span>
    );
  }
  const p = resolveProvenance(learner);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        <SourceDot learner={learner} size={size} />
        {p.text}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <GroupDot groups={groups} size={size} />
        {groupsText(groups)}
      </span>
    </span>
  );
}

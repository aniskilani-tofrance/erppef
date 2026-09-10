import { Badge } from "@/components/ui/badge";
import {
  LEAD_SCORES, leadStatusBadgeClass, leadStatusLabel, scoreBadgeClass, segmentLabel,
} from "@/lib/leads/status";

export function LeadStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge variant="outline" className={leadStatusBadgeClass(status)}>
      {leadStatusLabel(status)}
    </Badge>
  );
}

export function ScoreBadge({ score }: { score: string | null | undefined }) {
  const s = LEAD_SCORES.find((x) => x.code === score);
  return (
    <Badge variant="outline" className={scoreBadgeClass(score)} title={s?.hint ?? "Score pas encore attribué"}>
      {s?.label ?? "Sans score"}
    </Badge>
  );
}

export function SegmentBadge({ segment }: { segment: string | null | undefined }) {
  return (
    <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
      {segmentLabel(segment)}
    </Badge>
  );
}

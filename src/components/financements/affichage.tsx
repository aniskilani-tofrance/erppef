import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DEADLINE_KIND_CLASSES, DEADLINE_KIND_LABELS, FAMILY_LABELS, STAGE_CLASSES, STAGE_LABELS, WATCH_STATUS_CLASSES, WATCH_STATUS_LABELS,
  type DeadlineKind, type Family, type Stage, type WatchStatus,
} from "@/lib/financements/constants";
import { daysUntil, relativeLabel, URGENCY_CLASSES, urgencyOf } from "@/lib/financements/echeances";
import { deadlineHref, formatAmountRange, formatDueAt } from "@/lib/financements/liens";
import { DeadlineDoneCheckbox } from "./petits-boutons";

// Éléments d'affichage (composants serveur) partagés par les pages du module.

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge variant="outline" className={STAGE_CLASSES[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

export function WatchBadge({ status }: { status: WatchStatus }) {
  return <Badge variant="outline" className={WATCH_STATUS_CLASSES[status]}>{WATCH_STATUS_LABELS[status]}</Badge>;
}

export function KindChip({ kind }: { kind: DeadlineKind }) {
  return <Badge variant="outline" className={DEADLINE_KIND_CLASSES[kind].chip}>{DEADLINE_KIND_LABELS[kind]}</Badge>;
}

export function UrgencyDot({ dueAt, now }: { dueAt: string; now?: Date }) {
  const days = daysUntil(dueAt, now);
  const u = URGENCY_CLASSES[urgencyOf(days)];
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", u.dot)} title={u.label} aria-label={u.label} />;
}

export type DeadlineView = {
  id: string;
  kind: DeadlineKind;
  title: string;
  due_at: string;
  done_at: string | null;
  application_id: string | null;
  opportunity_id: string | null;
  funder_id: string | null;
  context: string | null; // dossier, opportunité ou financeur, en clair
};

// Une ligne d'échéance : pastille d'urgence, date, type, titre (lien), case « fait ».
export function DeadlineLine({ d, now, showDone = true, actions }: { d: DeadlineView; now?: Date; showDone?: boolean; actions?: React.ReactNode }) {
  const days = daysUntil(d.due_at, now);
  const u = URGENCY_CLASSES[urgencyOf(days)];
  return (
    <li className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 py-2", d.done_at && "opacity-60")}>
      <span className="mt-1.5">{d.done_at ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" /> : <UrgencyDot dueAt={d.due_at} now={now} />}</span>
      <div className="min-w-0 flex-1">
        <Link href={deadlineHref(d)} className={cn("font-medium hover:underline", d.done_at && "line-through")}>{d.title}</Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={cn(!d.done_at && u.text, "font-medium")}>{formatDueAt(d.due_at)}</span>
          {!d.done_at && <span>({relativeLabel(days)})</span>}
          <KindChip kind={d.kind} />
          {d.context && <span className="truncate">{d.context}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {actions}
        {showDone && <DeadlineDoneCheckbox id={d.id} done={!!d.done_at} label={`Fait : ${d.title}`} />}
      </div>
    </li>
  );
}

export type OpportunityView = {
  id: string;
  title: string;
  family: Family;
  watch_status: WatchStatus;
  funder_label: string | null;
  url: string | null;
  deadline_at: string | null;
  next_window_note: string | null;
  amount_min: number | null;
  amount_max: number | null;
  summary: string;
};

export function OpportunityCardBody({ o, now }: { o: OpportunityView; now?: Date }) {
  const amounts = formatAmountRange(o.amount_min, o.amount_max);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{FAMILY_LABELS[o.family]}</Badge>
        <WatchBadge status={o.watch_status} />
      </div>
      <Link href={`/financements/veille/${o.id}`} className="block font-medium leading-snug hover:underline">{o.title}</Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {o.funder_label && <span>{o.funder_label}</span>}
        {o.deadline_at ? (
          <span className="inline-flex items-center gap-1.5">
            <UrgencyDot dueAt={o.deadline_at} now={now} />
            {formatDueAt(o.deadline_at)}
          </span>
        ) : o.next_window_note ? (
          <span>Fenêtre : {o.next_window_note}</span>
        ) : (
          <span>Sans date</span>
        )}
        {amounts && <span>{amounts}</span>}
        {o.url && (
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <ExternalLink className="h-3 w-3" />Appel
          </a>
        )}
      </div>
      {o.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{o.summary}</p>}
    </div>
  );
}

// Contexte lisible d'une échéance à partir des jointures Supabase.
export function deadlineContext(row: {
  funding_applications?: unknown;
  funding_opportunities?: unknown;
  funders?: unknown;
}): string | null {
  const app = row.funding_applications as { title: string } | null | undefined;
  const opp = row.funding_opportunities as { title: string } | null | undefined;
  const funder = row.funders as { name: string } | null | undefined;
  const parts = [app?.title ?? opp?.title ?? null, funder?.name ?? null].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

export const DEADLINE_SELECT =
  "id, kind, title, due_at, done_at, reminder_days, auto_origin, application_id, opportunity_id, funder_id, funding_applications(title), funding_opportunities(title), funders(name)";

export function toDeadlineView(row: Record<string, unknown>): DeadlineView {
  return {
    id: row.id as string,
    kind: row.kind as DeadlineKind,
    title: row.title as string,
    due_at: row.due_at as string,
    done_at: (row.done_at as string | null) ?? null,
    application_id: (row.application_id as string | null) ?? null,
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    funder_id: (row.funder_id as string | null) ?? null,
    context: deadlineContext(row),
  };
}

import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireFinancements } from "@/lib/financements/acces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Family, type Stage, type WatchStatus } from "@/lib/financements/constants";
import { addDays, parisDay, relativeLabel, daysUntil, timeline, URGENCY_CLASSES } from "@/lib/financements/echeances";
import { formatDay, formatEuros } from "@/lib/financements/liens";
import { computeCounters } from "@/lib/financements/regles";
import { isActiveStage } from "@/lib/financements/stages";
import { DEADLINE_SELECT, DeadlineLine, OpportunityCardBody, StageBadge, toDeadlineView } from "@/components/financements/affichage";
import { TriageButtons } from "@/components/financements/triage-buttons";
import { cn } from "@/lib/utils";

// « Ma semaine » : ce que Marie voit le lundi en moins de 10 secondes.
//  1. la frise des 30 prochains jours (et ce qui est en retard),
//  2. les nouveautés de la veille à trier,
//  3. mes prochaines étapes,
//  4. les compteurs de l'année.
export default async function MaSemainePage() {
  const { orgId, userId } = await requireFinancements();
  const supabase = await createClient();
  const now = new Date();
  const today = parisDay(now);
  const year = Number(today.slice(0, 4));

  const [{ data: deadlines }, { data: fresh }, { data: apps }] = await Promise.all([
    supabase
      .from("funding_deadlines")
      .select(DEADLINE_SELECT)
      .eq("org_id", orgId)
      .is("done_at", null)
      .gte("due_at", `${addDays(today, -61)}T00:00:00Z`)
      .lte("due_at", `${addDays(today, 32)}T00:00:00Z`)
      .order("due_at"),
    supabase
      .from("funding_opportunities")
      .select("id, title, family, watch_status, url, deadline_at, next_window_note, amount_min, amount_max, summary, funder_name, funders(name)")
      .eq("org_id", orgId)
      .eq("watch_status", "nouveau")
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("funding_applications")
      .select("id, title, stage, owner_id, next_step, next_step_due, deadline_at, amount_granted, granted_on, created_at, funders(name)")
      .eq("org_id", orgId),
  ]);

  const frise = timeline((deadlines ?? []).map((d) => ({ ...toDeadlineView(d), reminder_days: null })), now);
  const overdue = frise.filter((d) => d.days < 0);
  const coming = frise.filter((d) => d.days >= 0);

  const allApps = apps ?? [];
  const counters = computeCounters(
    allApps.map((a) => ({ stage: a.stage as Stage, amount_granted: a.amount_granted, granted_on: a.granted_on, created_at: a.created_at })),
    year,
  );
  const mine = allApps
    .filter((a) => a.owner_id === userId && isActiveStage(a.stage as Stage))
    .sort((a, b) => (a.next_step_due ?? "9999").localeCompare(b.next_step_due ?? "9999"));

  return (
    <div className="space-y-5">
      {/* 1. Frise des 30 prochains jours */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>Les 30 prochains jours</span>
            <span className="flex flex-wrap gap-3 text-xs font-normal text-muted-foreground">
              {(["rouge", "orange", "vert"] as const).map((u) => (
                <span key={u} className="inline-flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", URGENCY_CLASSES[u].dot)} />
                  {URGENCY_CLASSES[u].label.toLowerCase()}
                </span>
              ))}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overdue.length > 0 && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50/60 px-3">
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-red-700">En retard ({overdue.length})</p>
              <ul className="divide-y divide-red-100">
                {overdue.map((d) => <DeadlineLine key={d.id} d={d} now={now} />)}
              </ul>
            </div>
          )}
          {coming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune échéance dans les 30 prochains jours.</p>
          ) : (
            <ul className="divide-y">
              {coming.map((d) => <DeadlineLine key={d.id} d={d} now={now} />)}
            </ul>
          )}
          <Link href="/financements/calendrier" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Tout le calendrier <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* 2. À trier */}
      <Card className={fresh?.length ? "border-sky-300" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4" />À trier ({fresh?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!fresh?.length ? (
            <p className="text-sm text-muted-foreground">Rien de nouveau dans la veille. <Link href="/financements/veille" className="text-primary hover:underline">Voir la veille</Link></p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {fresh.map((o) => (
                <li key={o.id} className="space-y-3 rounded-lg border p-3">
                  <OpportunityCardBody
                    now={now}
                    o={{
                      id: o.id, title: o.title, family: o.family as Family, watch_status: o.watch_status as WatchStatus,
                      funder_label: (o.funders as unknown as { name: string } | null)?.name ?? o.funder_name, url: o.url,
                      deadline_at: o.deadline_at, next_window_note: o.next_window_note, amount_min: o.amount_min,
                      amount_max: o.amount_max, summary: o.summary,
                    }}
                  />
                  <TriageButtons id={o.id} compact />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* 3. Mes prochaines étapes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mes prochaines étapes</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun dossier en cours dont vous êtes responsable.</p>
            ) : (
              <ul className="divide-y">
                {mine.map((a) => {
                  const late = a.next_step_due && a.next_step_due < today;
                  return (
                    <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/financements/dossiers/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                        <p className="text-xs text-muted-foreground">{(a.funders as unknown as { name: string } | null)?.name}</p>
                        <p className="mt-0.5 text-sm">{a.next_step || <span className="text-muted-foreground">Prochaine étape à préciser</span>}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs">
                        <StageBadge stage={a.stage as Stage} />
                        {a.next_step_due && (
                          <span className={cn(late ? "font-medium text-red-700" : "text-muted-foreground")}>
                            {formatDay(a.next_step_due)} ({relativeLabel(daysUntil(`${a.next_step_due}T12:00:00Z`, now))})
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 4. Compteurs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">En chiffres</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <Counter label="En rédaction" value={String(counters.enRedaction)} href="/financements/dossiers" />
              <Counter label="Déposés" value={String(counters.deposes)} href="/financements/dossiers" />
              <Counter label={`Accordés en ${year}`} value={String(counters.accordesAnnee)} href="/financements/dossiers" />
              <Counter label={`Montant accordé ${year}`} value={formatEuros(counters.montantAccordeAnnee)} href="/financements/financeurs" />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Counter({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </Link>
  );
}

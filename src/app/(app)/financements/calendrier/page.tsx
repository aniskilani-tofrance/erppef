import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, requireFinancements } from "@/lib/financements/acces";
import { localToUtc } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DEADLINE_KINDS, DEADLINE_KIND_CLASSES, DEADLINE_KIND_LABELS, type DeadlineKind } from "@/lib/financements/constants";
import { addDays, endOfMonth, isMonthParam, monthGrid, monthsFrom, parisDay, shiftMonth } from "@/lib/financements/echeances";
import { deadlineHref } from "@/lib/financements/liens";
import { DEADLINE_SELECT, DeadlineLine, toDeadlineView, type DeadlineView } from "@/components/financements/affichage";
import { DeadlineFormDialog } from "@/components/financements/deadline-form-dialog";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function monthLabel(month: string): string {
  const s = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

// Calendrier des échéances : vue mois (grille + liste du mois) et vue liste des 6
// prochains mois. Couleur par type d'échéance, case « fait », « Ajouter une échéance ».
export default async function CalendrierPage({ searchParams }: { searchParams: SP }) {
  const { orgId } = await requireFinancements();
  const sp = await searchParams;
  const now = new Date();
  const today = parisDay(now);
  const vue = one(sp.vue) === "liste" ? "liste" : "mois";
  const mois = isMonthParam(one(sp.mois)) ? (one(sp.mois) as string) : today.slice(0, 7);

  const months = vue === "liste" ? monthsFrom(today, 6) : [mois];
  const firstDay = vue === "liste" ? `${months[0]}-01` : monthGrid(mois)[0][0];
  const lastDay = vue === "liste" ? endOfMonth(`${months[5]}-01`) : monthGrid(mois).at(-1)![6];

  const supabase = await createClient();
  const [{ data }, funders, { data: apps }, { data: opps }] = await Promise.all([
    supabase
      .from("funding_deadlines")
      .select(DEADLINE_SELECT)
      .eq("org_id", orgId)
      .gte("due_at", localToUtc(firstDay, "00:00"))
      .lt("due_at", localToUtc(addDays(lastDay, 1), "00:00"))
      .order("due_at"),
    loadFundersLite(orgId),
    supabase.from("funding_applications").select("id, title").eq("org_id", orgId).not("stage", "in", "(abandonne,refuse)").order("title"),
    supabase.from("funding_opportunities").select("id, title").eq("org_id", orgId).neq("watch_status", "ecarte").order("title"),
  ]);
  const rows: DeadlineView[] = (data ?? []).map(toDeadlineView);
  const byDay = new Map<string, DeadlineView[]>();
  for (const d of rows) {
    const k = parisDay(d.due_at);
    byDay.set(k, [...(byDay.get(k) ?? []), d]);
  }

  const tab = (v: "mois" | "liste", label: string) => (
    <Link
      href={v === "liste" ? "/financements/calendrier?vue=liste" : `/financements/calendrier?mois=${mois}`}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", vue === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          {tab("mois", "Mois")}
          {tab("liste", "6 prochains mois")}
        </div>
        <DeadlineFormDialog funders={funders} applications={apps ?? []} opportunities={opps ?? []} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {DEADLINE_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("inline-block h-2 w-2 rounded-full", DEADLINE_KIND_CLASSES[k].dot)} />
            {DEADLINE_KIND_LABELS[k]}
          </span>
        ))}
      </div>

      {vue === "mois" ? (
        <>
          <div className="flex items-center justify-between">
            <Link href={`/financements/calendrier?mois=${shiftMonth(mois, -1)}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted" aria-label="Mois précédent">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-lg font-semibold">{monthLabel(mois)}</h2>
            <Link href={`/financements/calendrier?mois=${shiftMonth(mois, 1)}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted" aria-label="Mois suivant">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w) => <div key={w} className="py-1.5">{w}</div>)}
            </div>
            {monthGrid(mois).map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((day) => {
                  const items = byDay.get(day) ?? [];
                  const inMonth = day.startsWith(mois);
                  return (
                    <div key={day} className={cn("min-h-14 border-r p-1 last:border-r-0 sm:min-h-24", !inMonth && "bg-muted/30 text-muted-foreground")}>
                      <div className={cn("text-xs", day === today && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground")}>
                        {Number(day.slice(8))}
                      </div>
                      {/* Téléphone : pastilles ; écran large : titres */}
                      <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                        {items.map((d) => (
                          <span key={d.id} className={cn("inline-block h-2 w-2 rounded-full", DEADLINE_KIND_CLASSES[d.kind as DeadlineKind].dot, d.done_at && "opacity-30")} />
                        ))}
                      </div>
                      <ul className="mt-1 hidden space-y-0.5 sm:block">
                        {items.slice(0, 3).map((d) => (
                          <li key={d.id}>
                            <Link
                              href={deadlineHref(d)}
                              title={d.title}
                              className={cn("block truncate rounded border px-1 text-[11px] leading-4", DEADLINE_KIND_CLASSES[d.kind].chip, d.done_at && "line-through opacity-50")}
                            >
                              {d.title}
                            </Link>
                          </li>
                        ))}
                        {items.length > 3 && <li className="text-[11px] text-muted-foreground">+{items.length - 3}</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <MonthList rows={rows.filter((d) => parisDay(d.due_at).startsWith(mois))} now={now} empty="Aucune échéance ce mois-ci." />
        </>
      ) : (
        months.map((m) => (
          <section key={m} className="space-y-1">
            <h2 className="text-base font-semibold">{monthLabel(m)}</h2>
            <MonthList rows={rows.filter((d) => parisDay(d.due_at).startsWith(m))} now={now} empty="Aucune échéance." />
          </section>
        ))
      )}
    </div>
  );
}

function MonthList({ rows, now, empty }: { rows: DeadlineView[]; now: Date; empty: string }) {
  return (
    <Card>
      <CardContent className="pt-2">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">{rows.map((d) => <DeadlineLine key={d.id} d={d} now={now} />)}</ul>
        )}
      </CardContent>
    </Card>
  );
}

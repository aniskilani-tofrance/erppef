import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, requireFinancements } from "@/lib/financements/acces";
import { FAMILIES, WATCH_STATUSES, isOneOf, type Family, type WatchStatus } from "@/lib/financements/constants";
import { DEADLINE_FILTERS, matchesDeadlineFilter } from "@/lib/financements/echeances";
import { OpportunityCardBody } from "@/components/financements/affichage";
import { OpportunityFormDialog } from "@/components/financements/opportunity-form-dialog";
import { TriageButtons } from "@/components/financements/triage-buttons";
import { VeilleFilters } from "@/components/financements/veille-filters";
import { CreateApplicationButton } from "@/components/financements/petits-boutons";
import { WatchCard } from "@/components/financements/watch-card";
import { aiConfigured } from "@/lib/ai/client";
import { isoWeekday } from "@/lib/dates";
import { parisDay } from "@/lib/financements/echeances";
import { focusForWeekday, resolveWatchSettings, resolveWatchCap } from "@/lib/financements/veille-auto";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// « Chercher maintenant » lance une recherche web d'une à trois minutes.
export const maxDuration = 300;

// Veille : les opportunités repérées (recherche automatique, collecteur ou saisie), en cartes, filtrables.
export default async function VeillePage({ searchParams }: { searchParams: SP }) {
  const { orgId } = await requireFinancements();
  const sp = await searchParams;
  const famille = one(sp.famille);
  const statut = one(sp.statut);
  const financeur = one(sp.financeur);
  const echeance = one(sp.echeance);

  const supabase = await createClient();
  let q = supabase
    .from("funding_opportunities")
    .select("id, title, family, watch_status, url, deadline_at, next_window_note, amount_min, amount_max, summary, funder_id, funder_name, discard_reason, funders(name), funding_applications(id)")
    .eq("org_id", orgId);
  if (isOneOf(FAMILIES, famille)) q = q.eq("family", famille);
  if (isOneOf(WATCH_STATUSES, statut)) q = q.eq("watch_status", statut);
  else if (statut !== "toutes") q = q.neq("watch_status", "ecarte");
  if (financeur && /^[0-9a-f-]{36}$/i.test(financeur)) q = q.eq("funder_id", financeur);
  const [{ data }, funders, { data: org }] = await Promise.all([
    q.order("deadline_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(300),
    loadFundersLite(orgId),
    supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
  ]);
  const watch = resolveWatchSettings(org?.settings);

  const now = new Date();
  const rows = (data ?? []).filter((o) => !isOneOf(DEADLINE_FILTERS, echeance) || matchesDeadlineFilter(echeance, o.deadline_at, now));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Les appels trouvés par la recherche automatique ou ajoutés à la main. Les nouveautés se trient depuis « Ma semaine » ; une opportunité retenue devient un dossier en un clic.
        </p>
        <OpportunityFormDialog funders={funders} />
      </div>
      <WatchCard
        enabled={watch.enabled}
        profile={watch.profile}
        runs={watch.runs}
        aiReady={aiConfigured()}
        nextFocus={focusForWeekday(isoWeekday(parisDay(now))).label}
        budgetNote={`Plafond de la veille : ${resolveWatchCap(org?.settings)} $ par mois.`}
      />
      <VeilleFilters funders={funders} />
      <p className="text-xs text-muted-foreground">{rows.length} opportunité{rows.length > 1 ? "s" : ""}</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">Aucune opportunité avec ces filtres.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((o) => {
            const appId = (o.funding_applications as unknown as { id: string }[] | null)?.[0]?.id;
            const status = o.watch_status as WatchStatus;
            return (
              <li key={o.id} className="space-y-3 rounded-lg border bg-background p-3">
                <OpportunityCardBody
                  now={now}
                  o={{
                    id: o.id, title: o.title, family: o.family as Family, watch_status: status,
                    funder_label: (o.funders as unknown as { name: string } | null)?.name ?? o.funder_name, url: o.url,
                    deadline_at: o.deadline_at, next_window_note: o.next_window_note, amount_min: o.amount_min,
                    amount_max: o.amount_max, summary: o.summary,
                  }}
                />
                {status === "ecarte" && o.discard_reason && <p className="text-xs text-muted-foreground">Écartée : {o.discard_reason}</p>}
                {status === "nouveau" && <TriageButtons id={o.id} />}
                {appId ? (
                  <a href={`/financements/dossiers/${appId}`} className="text-sm text-primary hover:underline">Voir le dossier →</a>
                ) : (
                  (status === "a_evaluer" || status === "a_surveiller") && <CreateApplicationButton opportunityId={o.id} size="sm" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

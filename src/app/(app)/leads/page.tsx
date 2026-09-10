import Link from "next/link";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  LEAD_COLUMNS, computeKpis, loadLeadSettings, loadOwners, nextActionFor, ownerName, todayBuckets, todayParis, urgencyKey,
  type LeadRow,
} from "@/lib/leads/queries";
import { LEAD_STATUSES, isFinalStatus, leadRef, leadStatusBadgeClass, offerLabel } from "@/lib/leads/status";
import { formatPhone } from "@/lib/admission/phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadStatusBadge, ScoreBadge, SegmentBadge } from "@/components/leads/lead-badges";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { LeadImportDialog } from "@/components/leads/lead-import-dialog";
import { LeadSettingsDialog } from "@/components/leads/lead-settings-dialog";
import { LeadsFilter } from "@/components/leads/leads-filter";
import { ServiceClock } from "@/components/leads/service-clock";
import { TodayBoard } from "@/components/leads/today-board";
import { KpiStrip } from "@/components/leads/kpi-strip";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads restaurateurs — ERP PEF" };

// Le mini-CRM du setter : ce qu'il faut traiter aujourd'hui, l'entonnoir, la liste.
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, role } = await requireRole(["admin", "coordinator", "setter"]);
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const statut = one("statut");
  const score = one("score");
  const segment = one("segment");
  const suivi = one("suivi");
  const q = one("q").trim().toLowerCase();
  const filtering = Boolean(statut || score || segment || suivi || q);

  const supabase = await createClient();
  const [{ data }, owners, settings] = await Promise.all([
    supabase.from("employer_leads").select(LEAD_COLUMNS).order("received_at", { ascending: false }).limit(2000),
    loadOwners(supabase, orgId),
    loadLeadSettings(supabase, orgId),
  ]);
  const leads = (data ?? []) as unknown as LeadRow[];
  const today = todayParis();

  const counts: Record<string, number> = {};
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;

  const filtered = leads
    .filter((l) => (statut === "actifs" ? !isFinalStatus(l.status) : statut ? l.status === statut : true))
    .filter((l) => (score ? l.score === score : true))
    .filter((l) => (segment ? l.segment === segment : true))
    .filter((l) => (suivi ? l.owner_user_id === suivi : true))
    .filter((l) =>
      q
        ? [l.company, l.contact_name, l.city, l.phone, l.email, l.positions, leadRef(l.lead_no)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true,
    )
    .sort((a, b) => urgencyKey(a, today).localeCompare(urgencyKey(b, today)));

  const kpis = computeKpis(leads, today);
  const buckets = todayBuckets(leads, today);
  const canSettings = role === "admin" || role === "coordinator";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads restaurateurs</h1>
          <p className="text-sm text-muted-foreground">
            Rappeler sous 24 h, qualifier en 7 questions, poser le RDV hors service. {kpis.active} lead{kpis.active > 1 ? "s" : ""} en cours.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadFormDialog owners={owners} />
          <LeadImportDialog />
          <Button asChild variant="outline" size="sm" title="Mêmes colonnes que le Google Sheet de suivi">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement (route handler), pas une page */}
            <a href="/leads/export"><Download className="mr-2 h-4 w-4" />Exporter CSV</a>
          </Button>
          {canSettings && <LeadSettingsDialog settings={settings} />}
        </div>
      </div>

      <ServiceClock />

      {!filtering && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">À traiter aujourd&apos;hui</h2>
          <TodayBoard b={buckets} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Les chiffres du point hebdo</h2>
        <KpiStrip k={kpis} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {LEAD_STATUSES.map((s) => (
            <Link key={s.code} href={`/leads?statut=${s.code}`} title={`${s.hint} — voir la liste`}>
              <Badge variant="outline" className={cn(leadStatusBadgeClass(s.code), statut === s.code && "ring-2 ring-primary/40")}>
                {s.label} · {counts[s.code] ?? 0}
              </Badge>
            </Link>
          ))}
          {filtering && (
            <Link href="/leads" className="self-center text-xs text-muted-foreground underline">Tout afficher</Link>
          )}
        </div>
        <LeadsFilter owners={owners} counts={counts} />

        {filtered.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {leads.length === 0 ? "Aucun lead pour l'instant : créez le premier ou importez le Sheet de suivi." : "Aucun lead ne correspond à ces filtres."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden md:table-cell">Postes</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Prochaine action</TableHead>
                  <TableHead className="hidden lg:table-cell">Suivi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 300).map((l) => {
                  const next = nextActionFor(l, today);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-[260px]">
                        <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.company}</Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{leadRef(l.lead_no)}</span>{l.city ? ` · ${l.city}` : ""} · <SegmentBadge segment={l.segment} />
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.contact_name ?? <span className="text-muted-foreground">à identifier</span>}
                        <span className="block text-xs text-muted-foreground">{formatPhone(l.phone)}</span>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        {l.positions ?? "—"}{l.positions_count > 1 ? ` × ${l.positions_count}` : ""}
                        {l.offer && <span className="block text-xs text-muted-foreground">{offerLabel(l.offer)}</span>}
                      </TableCell>
                      <TableCell><ScoreBadge score={l.score} /></TableCell>
                      <TableCell><LeadStatusBadge status={l.status} /></TableCell>
                      <TableCell className="max-w-[260px] text-xs">
                        {next ? (
                          <>
                            <span className={cn(next.overdue && "font-semibold text-red-600")}>{next.label}</span>
                            <span className="block text-muted-foreground">{next.on.split("-").reverse().join("/")}{next.overdue ? " — en retard" : next.on === today ? " — aujourd'hui" : ""}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{ownerName(owners, l.owner_user_id) ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length > 300 && <p className="px-3 py-2 text-xs text-muted-foreground">300 premiers leads affichés — affinez les filtres.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

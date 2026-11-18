import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, requireFinancements } from "@/lib/financements/acces";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FAMILY_LABELS, type Family, type WatchStatus } from "@/lib/financements/constants";
import { inputFromDeadline } from "@/lib/financements/echeances";
import { formatAmountRange, formatDay, formatDueAt } from "@/lib/financements/liens";
import { DEADLINE_SELECT, DeadlineLine, StageBadge, toDeadlineView, UrgencyDot, WatchBadge } from "@/components/financements/affichage";
import { OpportunityFormDialog } from "@/components/financements/opportunity-form-dialog";
import { DeadlineFormDialog } from "@/components/financements/deadline-form-dialog";
import { TriageButtons } from "@/components/financements/triage-buttons";
import { CreateApplicationButton, DeleteOpportunityButton } from "@/components/financements/petits-boutons";
import type { Stage } from "@/lib/financements/constants";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// Fiche d'opportunité : tous les champs, le tri, et « Créer le dossier ».
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data: o }, funders, { data: deadlines }] = await Promise.all([
    supabase
      .from("funding_opportunities")
      .select("*, funders(id, name), funding_applications(id, title, stage)")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    loadFundersLite(orgId),
    supabase.from("funding_deadlines").select(DEADLINE_SELECT).eq("org_id", orgId).eq("opportunity_id", id).order("due_at"),
  ]);
  if (!o) notFound();

  const status = o.watch_status as WatchStatus;
  const funder = o.funders as unknown as { id: string; name: string } | null;
  const apps = (o.funding_applications as unknown as { id: string; title: string; stage: Stage }[] | null) ?? [];
  const dl = inputFromDeadline(o.deadline_at);
  const amounts = formatAmountRange(o.amount_min, o.amount_max);

  return (
    <div className="space-y-4">
      <Link href="/financements/veille" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Veille
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{FAMILY_LABELS[o.family as Family]}</Badge>
            <WatchBadge status={status} />
            <Badge variant="outline">{o.source === "collecteur" ? "Collecteur" : "Saisie"}</Badge>
          </div>
          <h2 className="text-xl font-semibold leading-snug">{o.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <OpportunityFormDialog
            funders={funders}
            initial={{
              id: o.id, title: o.title, family: o.family as Family, url: o.url, funder_id: o.funder_id, funder_name: o.funder_name,
              deadline_day: dl.day, deadline_time: dl.time, opens_on: o.opens_on,
              amount_min: o.amount_min === null ? "" : String(o.amount_min), amount_max: o.amount_max === null ? "" : String(o.amount_max),
              max_rate: o.max_rate === null ? "" : String(o.max_rate), summary: o.summary ?? "", eligibility_notes: o.eligibility_notes,
              criteria: o.criteria ?? null, required_documents: o.required_documents ?? null,
              next_window_note: o.next_window_note, watch_status: status, discard_reason: o.discard_reason,
            }}
          />
          {apps.length === 0 && <DeleteOpportunityButton id={o.id} />}
        </div>
      </div>

      {apps.length > 0 ? (
        <Card className="border-emerald-300 bg-emerald-50/40">
          <CardContent className="space-y-1 pt-4">
            {apps.map((a) => (
              <p key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                Dossier : <Link href={`/financements/dossiers/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                <StageBadge stage={a.stage} />
              </p>
            ))}
          </CardContent>
        </Card>
      ) : (
        status !== "ecarte" && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <p className="text-sm text-muted-foreground">On y va ? Le dossier reprend titre, financeur, date limite, montant et lien : rien à ressaisir.</p>
              <CreateApplicationButton opportunityId={o.id} />
            </CardContent>
          </Card>
        )
      )}

      {status === "nouveau" && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium">À trier</p>
            <TriageButtons id={o.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">L&apos;appel</CardTitle></CardHeader>
        <CardContent>
          <dl className="space-y-2.5">
            <Row label="Financeur">
              {funder ? <Link href={`/financements/financeurs/${funder.id}`} className="hover:underline">{funder.name}</Link> : o.funder_name ?? "—"}
            </Row>
            <Row label="Lien">
              {o.url ? (
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                  {o.url}<ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : "—"}
            </Row>
            <Row label="Ouverture">{formatDay(o.opens_on)}</Row>
            <Row label="Date limite">
              {o.deadline_at ? (
                <span className="inline-flex items-center gap-1.5"><UrgencyDot dueAt={o.deadline_at} />{formatDueAt(o.deadline_at)}</span>
              ) : "—"}
            </Row>
            {o.next_window_note && <Row label="Prochaine fenêtre">{o.next_window_note}</Row>}
            <Row label="Montants">{amounts ?? "—"}</Row>
            <Row label="Taux maximum">{o.max_rate === null ? "—" : `${Number(o.max_rate)} %`}</Row>
            <Row label="Résumé"><span className="whitespace-pre-line">{o.summary || "—"}</span></Row>
            <Row label="Conditions, vigilance"><span className="whitespace-pre-line">{o.eligibility_notes || "—"}</span></Row>
            {o.criteria && <Row label="Critères de sélection"><span className="whitespace-pre-line">{o.criteria}</span></Row>}
            {o.required_documents && <Row label="Pièces à joindre"><span className="whitespace-pre-line">{o.required_documents}</span></Row>}
            {status === "ecarte" && <Row label="Raison de l'écart">{o.discard_reason}</Row>}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Échéances</CardTitle>
          <DeadlineFormDialog
            funders={funders}
            applications={[]}
            opportunities={[{ id: o.id, title: o.title }]}
            preset={{ opportunity_id: o.id, funder_id: o.funder_id ?? undefined }}
            triggerVariant="outline"
          />
        </CardHeader>
        <CardContent>
          {!deadlines?.length ? (
            <p className="text-sm text-muted-foreground">{apps.length ? "Les échéances sont suivies sur le dossier." : "Aucune échéance."}</p>
          ) : (
            <ul className="divide-y">{deadlines.map((d) => <DeadlineLine key={d.id} d={toDeadlineView(d)} />)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

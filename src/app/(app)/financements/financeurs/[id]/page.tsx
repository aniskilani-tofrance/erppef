import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, requireFinancements } from "@/lib/financements/acces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNDER_KIND_LABELS, PORTAL_LABELS, type FunderKind, type Portal, type Stage } from "@/lib/financements/constants";
import { formatDueAt, formatEuros } from "@/lib/financements/liens";
import { cleanContacts } from "@/lib/financements/regles";
import { DEADLINE_SELECT, DeadlineLine, StageBadge, toDeadlineView } from "@/components/financements/affichage";
import { FunderFormDialog } from "@/components/financements/funder-form-dialog";
import { DeadlineFormDialog } from "@/components/financements/deadline-form-dialog";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// Fiche financeur : champs enrichis, contacts professionnels, dossiers et échéances liés.
export default async function FinanceurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data: f }, { data: apps }, { data: opps }, funders] = await Promise.all([
    supabase.from("funders").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
    supabase
      .from("funding_applications")
      .select("id, title, stage, amount_requested, amount_granted, deadline_at")
      .eq("org_id", orgId)
      .eq("funder_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("funding_opportunities").select("id, title").eq("org_id", orgId).eq("funder_id", id).neq("watch_status", "ecarte").order("title"),
    loadFundersLite(orgId),
  ]);
  if (!f) notFound();

  // Échéances liées : celles du financeur, de ses dossiers et de ses opportunités.
  const appIds = (apps ?? []).map((a) => a.id);
  const oppIds = (opps ?? []).map((o) => o.id);
  const ors = [`funder_id.eq.${id}`];
  if (appIds.length) ors.push(`application_id.in.(${appIds.join(",")})`);
  if (oppIds.length) ors.push(`opportunity_id.in.(${oppIds.join(",")})`);
  const { data: deadlines } = await supabase
    .from("funding_deadlines")
    .select(DEADLINE_SELECT)
    .eq("org_id", orgId)
    .is("done_at", null)
    .or(ors.join(","))
    .order("due_at");

  const contacts = cleanContacts(f.contacts);
  const granted = (apps ?? [])
    .filter((a) => a.stage === "accorde" || a.stage === "bilan_rendu")
    .reduce((s, a) => s + Number(a.amount_granted ?? 0), 0);

  return (
    <div className="space-y-4">
      <Link href="/financements/financeurs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Financeurs
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold leading-snug">
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
            {f.name}
          </h2>
          <p className="text-xs text-muted-foreground">Code {f.code} · {apps?.length ?? 0} dossier{(apps?.length ?? 0) > 1 ? "s" : ""} · {formatEuros(granted)} accordés</p>
        </div>
        <FunderFormDialog
          initial={{
            id: f.id, name: f.name, kind: (f.kind ?? null) as FunderKind | null, website: f.website, portal: (f.portal ?? null) as Portal | null,
            portal_account_ref: f.portal_account_ref, contacts, usual_rules: f.usual_rules, notes: f.notes,
          }}
        />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fiche</CardTitle></CardHeader>
        <CardContent>
          <dl className="space-y-2.5">
            <Row label="Type">{f.kind ? FUNDER_KIND_LABELS[f.kind as FunderKind] : "—"}</Row>
            <Row label="Portail">{f.portal ? PORTAL_LABELS[f.portal as Portal] : "—"}</Row>
            <Row label="Compte, numéros">{f.portal_account_ref ?? "—"}</Row>
            <Row label="Site">
              {f.website ? (
                <a href={f.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                  {f.website}<ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : "—"}
            </Row>
            <Row label="Règles habituelles"><span className="whitespace-pre-line">{f.usual_rules || "—"}</span></Row>
            <Row label="Notes"><span className="whitespace-pre-line">{f.notes || "—"}</span></Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Contacts</CardTitle></CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contact.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c, i) => (
                <li key={i} className="rounded-md border p-2 text-sm">
                  {c.nom && <p className="font-medium">{c.nom}</p>}
                  {c.fonction && <p className="text-muted-foreground">{c.fonction}</p>}
                  {c.courriel && (
                    <a href={`mailto:${c.courriel}`} className="flex items-center gap-1 break-all text-primary hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" />{c.courriel}</a>
                  )}
                  {c.telephone && (
                    <a href={`tel:${c.telephone.replace(/\s/g, "")}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3.5 w-3.5 shrink-0" />{c.telephone}</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Dossiers</CardTitle></CardHeader>
        <CardContent>
          {!apps?.length ? (
            <p className="text-sm text-muted-foreground">Aucun dossier.</p>
          ) : (
            <ul className="divide-y">
              {apps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/financements/dossiers/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {a.deadline_at && <span>{formatDueAt(a.deadline_at, false)}</span>}
                    <span>{a.amount_granted !== null ? `${formatEuros(a.amount_granted)} accordés` : a.amount_requested !== null ? `${formatEuros(a.amount_requested)} demandés` : ""}</span>
                    <StageBadge stage={a.stage as Stage} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Échéances à venir</CardTitle>
          <DeadlineFormDialog
            funders={funders}
            applications={(apps ?? []).map((a) => ({ id: a.id, title: a.title }))}
            opportunities={opps ?? []}
            preset={{ funder_id: f.id }}
            triggerVariant="outline"
          />
        </CardHeader>
        <CardContent>
          {!deadlines?.length ? (
            <p className="text-sm text-muted-foreground">Aucune échéance en cours.</p>
          ) : (
            <ul className="divide-y">{deadlines.map((d) => <DeadlineLine key={d.id} d={toDeadlineView(d)} />)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  LEAD_COLUMNS, dateParis, loadLeadSettings, loadOwners, loadSenderFirstName, nextActionFor, ownerName, todayParis,
  type LeadEventRow, type LeadRow,
} from "@/lib/leads/queries";
import {
  contractEligible, contractLabel, eventKindLabel, eventOutcomeLabel, horizonLabel, isFinalStatus, leadRef, offerLabel,
  potentialAmount, rdvModeLabel, sourceLabel,
} from "@/lib/leads/status";
import { formatPhone } from "@/lib/admission/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge, SegmentBadge } from "@/components/leads/lead-badges";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { LeadEventDialog, type LeadEventContext } from "@/components/leads/lead-event-dialog";
import { LeadQuickActions } from "@/components/leads/lead-quick-actions";
import { LeadRdvDialog, RdvOutcomeButtons } from "@/components/leads/lead-rdv-dialog";
import { DeleteLeadButton, LeadStatusSelect, NextActionEditor, OwnerSelect } from "@/components/leads/lead-status-controls";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lead — ERP PEF" };

function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }) : "—";
}

function Field({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", warn && "text-amber-700")}>{value ?? "—"}</dd>
    </div>
  );
}

// La fiche d'un lead : tout ce qu'il faut pour l'appel (qualification, actions un tap,
// prochaine action, RDV) et la mémoire de l'équipe (journal).
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, userId, role } = await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data: leadData }, { data: eventsData }, owners, settings, senderFirstName] = await Promise.all([
    supabase.from("employer_leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("employer_lead_events").select("id, lead_id, at, kind, outcome, note, by_user_id").eq("lead_id", id).order("at", { ascending: false }).limit(200),
    loadOwners(supabase, orgId),
    loadLeadSettings(supabase, orgId),
    loadSenderFirstName(supabase, userId),
  ]);
  if (!leadData) notFound();
  const lead = leadData as unknown as LeadRow;
  const events = (eventsData ?? []) as LeadEventRow[];
  const today = todayParis();
  const next = nextActionFor(lead, today);
  const eligible = contractEligible(lead.contract_type);
  const ctx: LeadEventContext = {
    leadId: lead.id,
    leadName: lead.company,
    currentStatus: lead.status,
    attempts: lead.attempts,
    firstContactOn: dateParis(lead.first_contact_at),
    rdvOn: dateParis(lead.rdv_at),
    rdvReminderSent: Boolean(lead.rdv_reminder_sent_at),
    today,
  };
  const rdvUpcoming = lead.rdv_at && lead.rdv_outcome === "a_venir";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/leads" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" />Tous les leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{lead.company}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{leadRef(lead.lead_no)}</span>
            <SegmentBadge segment={lead.segment} />
            <ScoreBadge score={lead.score} />
            {lead.offer && <span className="text-xs">Offre : {offerLabel(lead.offer)}</span>}
            <span className="text-xs">Reçu le {fmtDate(lead.received_at)} · {sourceLabel(lead.source)}{lead.campaign ? ` (${lead.campaign})` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadStatusSelect leadId={lead.id} status={lead.status} />
          <OwnerSelect leadId={lead.id} ownerUserId={lead.owner_user_id} owners={owners} />
        </div>
      </div>

      <LeadQuickActions lead={lead} settings={settings} setterFirstName={senderFirstName} ctx={ctx} />

      <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Lignes rouges : jamais « 100 % gratuit » (dire « 0 € de reste à charge sur la formation ») · jamais « aucun engagement » · jamais de promesse AKTO, d&apos;attestation HACCP ni de titres de séjour · jamais de tarif : c&apos;est le RDV de la direction.</span>
      </p>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card className={cn(next?.overdue && "border-red-300")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Prochaine action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isFinalStatus(lead.status) ? (
                <p className="text-sm text-muted-foreground">Lead clos ({lead.lost_reason ? lead.lost_reason : "plus rien à faire"}).</p>
              ) : next ? (
                <p className="text-sm">
                  <span className={cn("font-medium", next.overdue && "text-red-600")}>{next.label}</span>
                  <span className="ml-2 text-muted-foreground">{next.on.split("-").reverse().join("/")}{next.overdue ? " — en retard" : next.on === today ? " — aujourd'hui" : ""}</span>
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {lead.attempts} tentative{lead.attempts > 1 ? "s" : ""}{lead.first_contact_at ? ` · premier contact ${fmtDateTime(lead.first_contact_at)}` : " · jamais contacté"}{lead.last_contact_at ? ` · dernier ${fmtDateTime(lead.last_contact_at)}` : ""}
              </p>
              {!isFinalStatus(lead.status) && (
                <div className="flex flex-wrap items-center gap-2">
                  <LeadEventDialog ctx={ctx} />
                </div>
              )}
              {!isFinalStatus(lead.status) && <NextActionEditor leadId={lead.id} action={lead.next_action} on={lead.next_action_on} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rendez-vous avec la direction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.rdv_at ? (
                <p className="text-sm">
                  <span className="font-medium">{fmtDateTime(lead.rdv_at)}</span> — {rdvModeLabel(lead.rdv_mode)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {lead.rdv_outcome === "tenu" ? "tenu" : lead.rdv_outcome === "no_show" ? "manqué (no-show)" : lead.rdv_outcome === "reporte" ? "reporté" : lead.rdv_reminder_sent_at ? "rappel envoyé" : "rappel la veille à envoyer (SMS n°3)"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Pas encore de RDV. Deux créneaux hors service : {settings.slot1} ou {settings.slot2}.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!isFinalStatus(lead.status) && <LeadRdvDialog leadId={lead.id} slot1={settings.slot1} slot2={settings.slot2} hasRdv={Boolean(lead.rdv_at)} />}
                {rdvUpcoming && <RdvOutcomeButtons leadId={lead.id} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Qualification</CardTitle>
              <LeadFormDialog lead={lead} owners={owners} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="1. Taille" value={[lead.covers && `${lead.covers} couverts`, lead.team_size != null && `${lead.team_size} en équipe`].filter(Boolean).join(" · ") || null} />
                <Field label="2. Postes" value={lead.positions ? `${lead.positions}${lead.positions_count > 1 ? ` × ${lead.positions_count}` : ""}` : null} />
                <Field label="3. Pour quand" value={[horizonLabel(lead.hiring_horizon), lead.hiring_deadline].filter((x) => x && x !== "—").join(" — ") || null} />
                <Field
                  label="4. Contrat"
                  value={`${contractLabel(lead.contract_type)}${lead.hours_per_week ? ` · ${lead.hours_per_week} h/sem` : ""}${eligible === false ? " — pas de POEI : cascade FLE / AKTO / HACCP" : ""}`}
                  warn={eligible === false || (lead.hours_per_week != null && lead.hours_per_week < 24)}
                />
                <div className="sm:col-span-2"><Field label="5. Ce qui coince" value={lead.pain} /></div>
                <Field label="6. Décideur" value={lead.decision_maker == null ? "Pas encore demandé" : lead.decision_maker ? "Oui" : "Non — trouver le franchisé / gérant"} warn={lead.decision_maker === false} />
                <Field label="HACCP" value={lead.haccp_status === "oui" ? "À jour" : lead.haccp_status === "non" ? "Personne formée — porte d'entrée offre n°4" : "Pas demandé"} />
                <Field label="Potentiel POEI" value={`${potentialAmount(lead.positions_count).toLocaleString("fr-FR")} €`} />
                <div className="sm:col-span-2"><Field label="Notes" value={lead.notes} /></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contact et établissement</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact" value={[lead.contact_name, lead.contact_role].filter(Boolean).join(" — ") || null} />
                <Field label="Téléphone" value={lead.phone ? <a className="underline" href={`tel:${lead.phone.replace(/\s/g, "")}`}>{formatPhone(lead.phone)}</a> : null} />
                <Field label="Email" value={lead.email ? <a className="underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null} />
                <Field label="Adresse" value={[lead.city, lead.postal_code].filter(Boolean).join(" ") || null} />
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Journal ({events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune trace. Le premier appel s&apos;écrit ici.</p>
            ) : (
              <ul className="max-h-[70vh] space-y-2 overflow-y-auto text-sm">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 pl-3">
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(e.at)} · {ownerName(owners, e.by_user_id) ?? "—"}
                    </p>
                    <p>
                      <span className="font-medium">{eventKindLabel(e.kind)}</span>
                      {e.outcome && <span className="text-muted-foreground"> · {eventOutcomeLabel(e.outcome)}</span>}
                    </p>
                    {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {(role === "admin" || role === "coordinator") && (
        <div className="flex justify-end">
          <DeleteLeadButton leadId={lead.id} company={lead.company} />
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CANDIDATE_COLUMNS, qualificationProgress, type CandidateEventRow, type CandidateRow } from "@/lib/poei-candidates/queries";
import {
  FT_STATUSES, WORK_PERMITS, candidateDisplayName, candidateEventKindLabel, candidateEventOutcomeLabel, candidateRef, candidateSourceLabel,
  firstContactMessage, isFinalCandidateStatus,
} from "@/lib/poei-candidates/status";
import { isFinalStatus, leadRef } from "@/lib/leads/status";
import { loadOwners, loadSenderFirstName, ownerName, todayParis } from "@/lib/leads/queries";
import { formatPhone } from "@/lib/admission/phone";
import { learnerRef } from "@/lib/refs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import {
  CandidateEventDialog, CandidateFormDialog, CandidateStatusSelect, ConsentControl, DeleteCandidateButton, PlacementSelect,
} from "@/components/poei-candidates/candidate-controls";
import { cn } from "@/lib/utils";

export const metadata = { title: "Candidat POEI — ERP PEF" };

function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";
}

function Field({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("whitespace-pre-line text-sm", warn && "text-amber-700")}>{value || "—"}</dd>
    </div>
  );
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, userId, role } = await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data }, { data: eventsData }, { data: leads }, owners, senderFirstName] = await Promise.all([
    supabase.from("poei_candidates").select(CANDIDATE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("poei_candidate_events").select("id, at, kind, outcome, note, by_user_id").eq("candidate_id", id).order("at", { ascending: false }).limit(200),
    supabase.from("employer_leads").select("id, lead_no, company, city, status").order("received_at", { ascending: false }).limit(2000),
    loadOwners(supabase, orgId),
    loadSenderFirstName(supabase, userId),
  ]);
  if (!data) notFound();
  const c = data as unknown as CandidateRow;
  const events = (eventsData ?? []) as CandidateEventRow[];
  const name = candidateDisplayName(c);
  const today = todayParis();
  const direction = role === "admin" || role === "coordinator";

  // Restaurateurs proposables : leads employeurs encore actifs ou gagnés (+ celui déjà choisi).
  const employers = (leads ?? [])
    .filter((l) => l.id === c.placed_lead_id || l.status === "gagne" || !isFinalStatus(l.status as string))
    .filter((l) => l.id !== c.from_lead_id)
    .map((l) => ({ id: l.id as string, label: `${l.company}${l.city ? ` — ${l.city}` : ""} (${leadRef(l.lead_no as number | null)})` }));
  const fromLead = (leads ?? []).find((l) => l.id === c.from_lead_id);
  const placedLead = (leads ?? []).find((l) => l.id === c.placed_lead_id);

  let learnerLabel: string | null = null;
  if (c.learner_id && direction) {
    const { data: l } = await supabase.from("learners").select("learner_no").eq("id", c.learner_id).maybeSingle();
    learnerLabel = l ? learnerRef(l.learner_no as number | null) : null;
  }

  const overdue = c.next_action_on != null && c.next_action_on < today && !isFinalCandidateStatus(c.status);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/candidats-poei" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" />Tous les candidats
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{candidateRef(c.candidate_no)}</span>
            <span>{candidateSourceLabel(c.source)}</span>
            {learnerLabel && <span>· apprenant <span className="font-mono">{learnerLabel}</span> (liste Admission)</span>}
            {fromLead && (
              <span>· venu du lead <Link className="underline" href={`/leads/${fromLead.id}`}>{leadRef(fromLead.lead_no as number | null)}</Link></span>
            )}
            <span>· créé le {fmtDateTime(c.created_at)}</span>
          </div>
        </div>
        <CandidateStatusSelect candidateId={c.id} status={c.status} hasConsent={Boolean(c.consent_at)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {c.phone && (
          <a
            href={`tel:${c.phone.replace(/\s/g, "")}`}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent"
          >
            <Phone className="mr-2 h-4 w-4" />{formatPhone(c.phone)}
          </a>
        )}
        <WhatsAppButton phone={c.phone} message={firstContactMessage(c, senderFirstName)} label="WhatsApp — premier contact" title="Ouvre WhatsApp avec le message de premier contact (à relire), puis notez le contact" />
        <CandidateEventDialog candidateId={c.id} nextAction={c.next_action} nextActionOn={c.next_action_on} />
      </div>

      {!c.consent_at && !isFinalCandidateStatus(c.status) && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Consentement pas encore recueilli : on peut appeler et poser les questions, mais pas passer « Qualifié » ni présenter la personne à un restaurateur.
            {c.source === "asso_pef" && " Tant qu'il manque, la fiche est invisible du setter."}
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card className={cn(overdue && "border-red-300")}>
            <CardHeader className="pb-2"><CardTitle className="text-base">Prochaine action</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {isFinalCandidateStatus(c.status) ? (
                <p className="text-muted-foreground">Fiche close{c.lost_reason ? ` (${c.lost_reason})` : ""}.</p>
              ) : c.next_action ? (
                <p>
                  <span className={cn("font-medium", overdue && "text-red-600")}>{c.next_action}</span>
                  {c.next_action_on && <span className="ml-2 text-muted-foreground">{c.next_action_on.split("-").reverse().join("/")}{overdue ? " — en retard" : ""}</span>}
                </p>
              ) : (
                <p className="text-muted-foreground">{c.attempts === 0 ? "Premier appel à faire." : "Aucune action planifiée : notez la suite avec « Noter un contact »."}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {c.attempts} tentative{c.attempts > 1 ? "s" : ""}{c.last_contact_at ? ` · dernier contact ${fmtDateTime(c.last_contact_at)}` : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Consentement et restaurateur</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ConsentControl candidateId={c.id} consentAt={c.consent_at} consentChannel={c.consent_channel} />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Présenté(e) chez :</p>
                <PlacementSelect candidateId={c.id} placedLeadId={c.placed_lead_id} employers={employers} hasConsent={Boolean(c.consent_at)} />
                {placedLead && <Link href={`/leads/${placedLead.id}`} className="text-xs underline">Ouvrir le lead {leadRef(placedLead.lead_no as number | null)}</Link>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Qualification · {qualificationProgress(c)}/10</CardTitle>
              <CandidateFormDialog candidate={c} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="1. France Travail" value={`${FT_STATUSES.find((s) => s.code === c.ft_status)?.label ?? "—"}${c.ft_id ? ` · ${c.ft_id}` : ""}`} warn={c.ft_status === "non_inscrit"} />
                <Field label="2. Ressources" value={c.income} />
                <div className="sm:col-span-2"><Field label="3. Projet" value={c.goal} /></div>
                <Field label="4. Poste visé" value={c.target_job} />
                <Field label="5. Expérience" value={c.experience} />
                <Field label="6. Disponibilités" value={c.availability} />
                <Field label="7. Mobilité" value={c.mobility} />
                <Field label="8. Autorisation de travail" value={WORK_PERMITS.find((s) => s.code === c.work_permit)?.label} warn={c.work_permit === "non" || c.work_permit === "a_verifier"} />
                <Field label="9. Contraintes" value={c.constraints} />
                <Field label="Niveau de français" value={c.french_level} />
                <Field label="Ville" value={c.city} />
                <Field label="Email" value={c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : null} />
                <div className="sm:col-span-2"><Field label="Notes" value={c.notes} /></div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Journal ({events.length})</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Rien pour l&apos;instant.</p>
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(e.at)}{ownerName(owners, e.by_user_id) ? ` · ${ownerName(owners, e.by_user_id)}` : ""}
                    </p>
                    <p>
                      <span className="font-medium">{candidateEventKindLabel(e.kind)}</span>
                      {candidateEventOutcomeLabel(e.outcome) ? ` — ${candidateEventOutcomeLabel(e.outcome)}` : ""}
                    </p>
                    {e.note && <p className="whitespace-pre-line text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {direction && (
        <div className="flex justify-end">
          <DeleteCandidateButton candidateId={c.id} name={name} />
        </div>
      )}
    </div>
  );
}

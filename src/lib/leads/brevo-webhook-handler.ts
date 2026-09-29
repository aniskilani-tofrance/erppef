import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailStatusForBrevoEvent,
  journalLineForBrevoEvent,
  mergeEmailStatus,
  stopReasonForEmailStatus,
  type BrevoWebhookEvent,
} from "@/lib/leads/brevo-webhook";
import { titreEmail } from "@/lib/leads/journal";
import { isFinalStatus, leadRef } from "@/lib/leads/status";
import { stopLeadSequence, type SequenceLead } from "@/lib/leads/sequence-engine";

// Traitement d'un retour Brevo (délivré, bounce, désinscription, plainte…) : retrouver la
// fiche, conserver le retour, mettre à jour le statut e-mail, journaliser, arrêter la
// séquence si l'adresse ne doit plus rien recevoir. Séparé de la route HTTP pour être
// testé avec le faux client Supabase.

type Admin = SupabaseClient;

/**
 * Retrouve la fiche visée par un retour Brevo, du plus sûr au moins sûr : le numéro de
 * fiche porté par l'e-mail (en-tête / tag), l'identifiant de message conservé au journal,
 * puis l'adresse e-mail. Dans ce dernier cas, une fiche encore ouverte passe avant une
 * fiche close, même plus récente : un bounce ne doit pas se poser sur un dossier perdu
 * quand le même restaurateur a une demande en cours.
 */
export async function findLead(admin: Admin, orgId: string, ev: BrevoWebhookEvent): Promise<SequenceLead | null> {
  if (ev.leadNo != null) {
    const { data } = await admin.from("employer_leads").select("*").eq("org_id", orgId).eq("lead_no", ev.leadNo).maybeSingle();
    if (data) return data as SequenceLead;
  }
  if (ev.messageId) {
    const { data: events } = await admin.from("employer_lead_events").select("lead_id").eq("org_id", orgId).ilike("note", `%${ev.messageId}%`).limit(1);
    const leadId = events?.[0]?.lead_id as string | undefined;
    if (leadId) {
      const { data } = await admin.from("employer_leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
      if (data) return data as SequenceLead;
    }
  }
  if (ev.email) {
    const { data } = await admin
      .from("employer_leads")
      .select("*")
      .eq("org_id", orgId)
      .ilike("email", ev.email)
      .order("received_at", { ascending: false })
      .limit(5);
    const candidates = (data ?? []) as SequenceLead[];
    return candidates.find((lead) => !isFinalStatus(lead.status)) ?? candidates[0] ?? null;
  }
  return null;
}

export async function handleBrevoEvent(admin: Admin, orgId: string, ev: BrevoWebhookEvent) {
  // Brevo peut renvoyer un même événement : une seule trace par message et par événement.
  if (ev.messageId) {
    const { data: duplicate } = await admin
      .from("employer_lead_email_events")
      .select("id")
      .eq("org_id", orgId)
      .eq("message_id", ev.messageId)
      .eq("event", ev.event)
      .limit(1);
    if (duplicate?.length) return { event: ev.event, doublon: true };
  }

  const lead = await findLead(admin, orgId, ev);
  await admin.from("employer_lead_email_events").insert({
    org_id: orgId,
    lead_id: lead?.id ?? null,
    event: ev.event,
    email: ev.email,
    message_id: ev.messageId,
    lead_event: ev.leadEvent,
    reason: ev.reason,
    occurred_at: ev.occurredAt,
    payload: ev.raw,
  });

  const status = emailStatusForBrevoEvent(ev.event);
  if (!lead || !status) return { event: ev.event, fiche: lead ? leadRef(lead.lead_no) : null, retenu: Boolean(status) };

  const merged = mergeEmailStatus(lead.email_status, status);
  await admin.from("employer_leads").update({ email_status: merged, email_status_at: ev.occurredAt }).eq("id", lead.id).eq("org_id", orgId);
  await admin.from("employer_lead_events").insert({
    org_id: orgId,
    lead_id: lead.id,
    kind: "note",
    outcome: "autre",
    note: journalLineForBrevoEvent(ev, status, titreEmail(ev.leadEvent)),
  });

  const stop = stopReasonForEmailStatus(status);
  if (stop) await stopLeadSequence(admin, { orgId, lead: { ...lead, email_status: merged }, reason: stop });
  return { event: ev.event, fiche: leadRef(lead.lead_no), statut: merged, arret: stop };
}

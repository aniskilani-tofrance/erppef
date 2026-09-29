import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrgByLeadsToken, leadsTokenOf } from "@/lib/leads/webhook-auth";
import {
  emailStatusForBrevoEvent,
  journalLineForBrevoEvent,
  mergeEmailStatus,
  parseBrevoWebhook,
  stopReasonForEmailStatus,
  type BrevoWebhookEvent,
} from "@/lib/leads/brevo-webhook";
import { titreEmail } from "@/lib/leads/journal";
import { leadRef } from "@/lib/leads/status";
import { stopLeadSequence, type SequenceLead } from "@/lib/leads/sequence-engine";

// Retours Brevo sur les e-mails transactionnels : POST /api/leads/brevo-webhook?token=<jeton>
//
// À configurer une fois dans Brevo (Transactionnel → Paramètres → Webhooks) avec les
// événements délivré, bounce doux, bounce dur, bloqué, adresse invalide, désinscription
// et plainte. Chaque retour est conservé dans employer_lead_email_events ; les quatre
// familles qui comptent (délivré, bounce, désinscription, plainte) remontent sur la
// fiche, s'écrivent dans son journal et arrêtent la séquence quand l'adresse ne doit
// plus rien recevoir. La réponse est toujours 200 quand le jeton est bon : Brevo réessaie
// sur toute autre réponse, et un retour illisible n'a pas besoin d'être rejoué.

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

export async function GET(req: NextRequest) {
  const org = await findOrgByLeadsToken(leadsTokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    organisation: org.name,
    message: "Point d'entrée des retours Brevo actif : déclarez cette adresse comme webhook transactionnel (POST).",
  });
}

export async function POST(req: NextRequest) {
  const org = await findOrgByLeadsToken(leadsTokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, traites: 0, ignore: "corps illisible" });
  }
  const events = parseBrevoWebhook(body);
  const admin = createAdminClient();
  const details: unknown[] = [];
  for (const ev of events) {
    try {
      details.push(await handleBrevoEvent(admin, org.id, ev));
    } catch (e) {
      console.error("[brevo-webhook]", e instanceof Error ? e.message : e);
      details.push({ event: ev.event, ok: false });
    }
  }
  return NextResponse.json({ ok: true, traites: details.length, details });
}

async function findLead(admin: Admin, orgId: string, ev: BrevoWebhookEvent): Promise<SequenceLead | null> {
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
    const { data } = await admin.from("employer_leads").select("*").eq("org_id", orgId).ilike("email", ev.email).order("received_at", { ascending: false }).limit(1);
    if (data?.[0]) return data[0] as SequenceLead;
  }
  return null;
}

async function handleBrevoEvent(admin: Admin, orgId: string, ev: BrevoWebhookEvent) {
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

import type { SupabaseClient } from "@supabase/supabase-js";
import { textToHtml } from "@/lib/admission/messages";
import { firstNameOf, leadVars, renderEmail, type LeadSettings } from "@/lib/leads/templates";

/**
 * Customer-facing points in the POEI restaurant journey. One marker per lead and
 * per event makes a retry harmless: the CRM, not the emailing tool, remains the
 * source of truth for workflow status.
 */
export const BREVO_LEAD_EVENTS = {
  nouveau: "poei_lead_nouveau",
  aRappeler: "poei_lead_a_rappeler",
  rdvPris: "poei_lead_rdv_pris",
  rappelRdv: "poei_lead_rappel_rdv",
  noShow: "poei_lead_no_show",
  dernierMessage: "poei_lead_dernier_message",
} as const;

export type BrevoLeadEvent = (typeof BREVO_LEAD_EVENTS)[keyof typeof BREVO_LEAD_EVENTS];

/** Only a status which changes the prospect's journey starts an automated email. */
export function brevoEventForStatus(status: string | null | undefined): BrevoLeadEvent | null {
  switch (status) {
    case "nouveau": return BREVO_LEAD_EVENTS.nouveau;
    case "a_rappeler": return BREVO_LEAD_EVENTS.aRappeler;
    case "rdv_pris": return BREVO_LEAD_EVENTS.rdvPris;
    default: return null;
  }
}

export type LeadForBrevo = {
  id: string;
  lead_no: number | null;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  postal_code: string | null;
  positions: string | null;
  positions_count: number | null;
  segment: string | null;
  status: string;
  owner_user_id?: string | null;
  rdv_at: string | null;
  rdv_mode: string | null;
};

/**
 * Flat event data retained for traceability and future Brevo workflow use.
 * Transactional sending below intentionally does not require an Enterprise
 * inbound-webhook feature, but this shape keeps the CRM-to-Brevo contract
 * documented and testable.
 */
export function buildBrevoLeadPayload(
  lead: LeadForBrevo,
  settings: LeadSettings,
  eventName: BrevoLeadEvent,
  now: Date = new Date(),
) {
  const email = cleanEmail(lead.email);
  const names = (lead.contact_name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    event_name: eventName,
    event_date: now.toISOString(),
    identifier: email ?? lead.phone ?? lead.id,
    email: email ?? "",
    lead_ref: leadReference(lead.lead_no) ?? lead.id,
    prenom: names[0] ?? "",
    nom: names.slice(1).join(" "),
    entreprise: lead.company,
    telephone: lead.phone ?? "",
    ville: lead.city ?? "",
    code_postal: lead.postal_code ?? "",
    postes: lead.positions ?? "",
    nb_postes: lead.positions_count ?? 0,
    segment: lead.segment ?? "",
    statut: lead.status,
    rdv_at: lead.rdv_at ?? "",
    rdv_format: lead.rdv_mode ?? "",
    calendly: settings.calendlyUrl,
    directeur: settings.directorName,
  };
}

type DispatchResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: "not_configured" | "no_email" | "already_sent" | "delivery_failed" };

function cleanEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function leadReference(leadNo: number | null): string | null {
  return leadNo == null ? null : `L-${String(leadNo).padStart(4, "0")}`;
}

function messageFor(eventName: BrevoLeadEvent, lead: LeadForBrevo, settings: LeadSettings, setterName: string) {
  const firstName = firstNameOf(lead.contact_name) || "Bonjour";
  const vars = leadVars(lead, settings, setterName);

  if (eventName === BREVO_LEAD_EVENTS.nouveau) {
    return {
      subject: `${firstName}, votre demande de recrutement est bien reçue`,
      body: `Bonjour ${firstName},

Merci pour votre demande concernant ${lead.company}. ${setterName}, de ParlerEmploi Formation, va l’étudier et vous appeler sous 24 heures ouvrées, en évitant les heures de service.

L’objectif du premier échange est simple : comprendre vos besoins en ${vars.metier} et vérifier si la POEI peut vous aider à recruter avec un candidat formé avant l’embauche.

Si vous préférez choisir directement un créneau de 15 minutes hors service, vous pouvez le faire ici : ${settings.calendlyUrl}

À bientôt,
${setterName}
ParlerEmploi Formation`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.aRappeler) {
    return {
      subject: `${firstName}, quel créneau pour parler de votre recrutement ?`,
      body: `Bonjour ${firstName},

Je viens de tenter de vous joindre au sujet de votre recherche de personnel pour ${lead.company}. J’imagine que je tombe en plein service.

Pour éviter de vous déranger, choisissez un créneau de 15 minutes en dehors du service : ${settings.calendlyUrl}

Ou répondez simplement à ce mail avec le meilleur moment pour vous rappeler.

Bien cordialement,
${setterName}
ParlerEmploi Formation`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.rdvPris) return renderEmail("confirmation_rdv", vars);

  if (eventName === BREVO_LEAD_EVENTS.rappelRdv) {
    return {
      subject: `Rappel : notre rendez-vous demain — ${lead.company}`,
      body: `Bonjour ${firstName},

Petit rappel pour notre rendez-vous demain ${vars.jour} à ${vars.heure}${vars.mode ? ` ${vars.mode}` : ""} avec ${settings.directorName}, au sujet de vos recrutements en ${vars.metier}.

En cas d’empêchement, répondez directement à ce message : nous trouverons un autre créneau hors service.

À demain,
${setterName}
ParlerEmploi Formation`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.noShow) return renderEmail("no_show", vars);
  return renderEmail("rupture_j10", vars);
}

function brandedHtml(body: string) {
  const content = textToHtml(body);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f7f5;font-family:Arial,Helvetica,sans-serif;color:#17251c"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f5;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden"><tr><td style="height:6px;background:#1c5b3c"></td></tr><tr><td style="padding:32px 34px 18px;font-size:14px;font-weight:700;color:#1c5b3c">PARLEREMPLOI FORMATION</td></tr><tr><td style="padding:0 34px 28px;font-size:16px;line-height:1.62">${content}</td></tr><tr><td style="padding:18px 34px;background:#f0f5f1;font-size:12px;line-height:1.45;color:#4f5f54">ParlerEmploi Formation · Recrutement & formation restauration<br>Vous recevez ce message à la suite de votre demande de contact.</td></tr></table></td></tr></table></body></html>`;
}

function deliveryMarker(eventName: BrevoLeadEvent): string {
  return `[brevo:${eventName}]`;
}

/**
 * Sends from the CRM through Brevo's Transactional Email API. Unlike Brevo
 * inbound automation webhooks, this works on the current subscription and uses
 * Brevo for deliverability, logs, and sender reputation without adding an
 * Enterprise webhook plan.
 */
export async function dispatchBrevoLeadEvent(
  supabase: SupabaseClient,
  params: { orgId: string; lead: LeadForBrevo; settings: LeadSettings; eventName: BrevoLeadEvent },
): Promise<DispatchResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const email = cleanEmail(params.lead.email);
  if (!apiKey) return { sent: false, reason: "not_configured" };
  if (!email) return { sent: false, reason: "no_email" };

  const marker = deliveryMarker(params.eventName);
  const { data: prior } = await supabase
    .from("employer_lead_events")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("lead_id", params.lead.id)
    .ilike("note", `%${marker}%`)
    .limit(1);
  if (prior?.[0]) return { sent: false, reason: "already_sent" };

  let setterName = "Shahzad";
  if (params.lead.owner_user_id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", params.lead.owner_user_id)
      .maybeSingle();
    const fullName = (owner?.full_name as string | null | undefined)?.trim();
    if (fullName) setterName = fullName.split(/\s+/)[0] || setterName;
  }
  const message = messageFor(params.eventName, params.lead, params.settings, setterName);
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || "contact@parleremploi.fr";
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ParlerEmploi Formation";

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        replyTo: { name: `${setterName} — ParlerEmploi`, email: senderEmail },
        to: [{ email, name: params.lead.contact_name || params.lead.company }],
        subject: message.subject,
        htmlContent: brandedHtml(message.body),
        textContent: message.body,
        tags: ["poei_restauration", params.eventName],
        headers: { "X-Mailin-custom": `lead_ref:${leadReference(params.lead.lead_no) ?? params.lead.id}|event:${params.eventName}` },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => ({}))) as { messageId?: string; code?: string; message?: string };
    if (!response.ok) {
      console.error(`[brevo] ${params.eventName} delivery failed: ${response.status}`, result);
      return { sent: false, reason: "delivery_failed" };
    }

    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "note",
      outcome: "autre",
      note: `${marker} Email envoyé via Brevo${result.messageId ? ` (${result.messageId})` : ""}.`,
    });
    if (error) console.error(`[brevo] ${params.eventName} journalisation impossible`, error.message);
    return { sent: true, messageId: result.messageId ?? null };
  } catch (error) {
    console.error(`[brevo] ${params.eventName} delivery failed`, error);
    return { sent: false, reason: "delivery_failed" };
  }
}

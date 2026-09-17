import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
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
  rappelRdvH2: "poei_lead_rappel_rdv_h2",
  rappelQualificationJ1: "poei_lead_rappel_qualification_j1",
  rappelQualificationH2: "poei_lead_rappel_qualification_h2",
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
  qualification_at?: string | null;
  qualification_reminder_j1_batch_id?: string | null;
  qualification_reminder_h2_batch_id?: string | null;
  rdv_reminder_j1_batch_id?: string | null;
  rdv_reminder_h2_batch_id?: string | null;
};

export type AppointmentReminderKind = "qualification" | "rdv";
type ReminderBatchColumn =
  | "qualification_reminder_j1_batch_id"
  | "qualification_reminder_h2_batch_id"
  | "rdv_reminder_j1_batch_id"
  | "rdv_reminder_h2_batch_id";

type ReminderPlan = {
  eventName: BrevoLeadEvent;
  batchColumn: ReminderBatchColumn;
  scheduledAt: string;
};

const BREVO_SCHEDULE_WINDOW_MS = 72 * 3_600_000;
const MINIMUM_SCHEDULE_LEAD_MS = 5 * 60_000;

/**
 * Brevo accepts transactional schedules no more than 72 hours ahead. A booking
 * further away is picked up by the daily CRM cron once it enters that window.
 * A reminder already due is deliberately not recreated after the fact.
 */
export function appointmentReminderPlans(
  kind: AppointmentReminderKind,
  appointmentAt: string,
  now: Date = new Date(),
): ReminderPlan[] {
  const appointmentMs = Date.parse(appointmentAt);
  if (!Number.isFinite(appointmentMs)) return [];

  const definitions = kind === "qualification"
    ? [
        { hoursBefore: 24, eventName: BREVO_LEAD_EVENTS.rappelQualificationJ1, batchColumn: "qualification_reminder_j1_batch_id" as const },
        { hoursBefore: 2, eventName: BREVO_LEAD_EVENTS.rappelQualificationH2, batchColumn: "qualification_reminder_h2_batch_id" as const },
      ]
    : [
        { hoursBefore: 24, eventName: BREVO_LEAD_EVENTS.rappelRdv, batchColumn: "rdv_reminder_j1_batch_id" as const },
        { hoursBefore: 2, eventName: BREVO_LEAD_EVENTS.rappelRdvH2, batchColumn: "rdv_reminder_h2_batch_id" as const },
      ];

  return definitions.flatMap((definition) => {
    const scheduledMs = appointmentMs - definition.hoursBefore * 3_600_000;
    const waitMs = scheduledMs - now.getTime();
    if (waitMs < MINIMUM_SCHEDULE_LEAD_MS || waitMs > BREVO_SCHEDULE_WINDOW_MS) return [];
    return [{
      eventName: definition.eventName,
      batchColumn: definition.batchColumn,
      scheduledAt: new Date(scheduledMs).toISOString(),
    }];
  });
}

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

export function brevoMessageFor(eventName: BrevoLeadEvent, lead: LeadForBrevo, settings: LeadSettings) {
  const firstName = firstNameOf(lead.contact_name) || "Bonjour";
  const vars = leadVars(lead, settings, "Votre conseiller ParlerEmploi");

  if (eventName === BREVO_LEAD_EVENTS.nouveau) {
    return {
      subject: `${firstName}, votre besoin de recrutement pour ${lead.company} est pris en compte`,
      body: `Bonjour ${firstName},

Votre demande concernant ${lead.company} est bien prise en compte par notre équipe conseil.

L'objectif du premier échange est de comprendre vos besoins en ${vars.metier}, vos contraintes d'exploitation et de vérifier si la POEI peut préparer une solution de recrutement adaptée à votre établissement.

Vous pouvez choisir dès maintenant un créneau de 15 minutes, en dehors du service si nécessaire : ${settings.calendlyUrl}

L'équipe conseil ParlerEmploi
Recrutement & formation restauration`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.aRappeler) {
    return {
      subject: `${firstName}, quel créneau pour avancer sur les recrutements de ${lead.company} ?`,
      body: `Bonjour ${firstName},

Nous avons tenté de vous joindre au sujet de votre recherche de personnel pour ${lead.company}. Nous préférons éviter de vous appeler pendant le service.

Choisissez le créneau de 15 minutes le plus pratique pour échanger sur vos besoins en ${vars.metier} : ${settings.calendlyUrl}

Ou répondez simplement à ce mail avec le meilleur moment pour vous rappeler.

L'équipe conseil ParlerEmploi`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.rdvPris) return renderEmail("confirmation_rdv", vars);

  if (eventName === BREVO_LEAD_EVENTS.rappelRdv) {
    return {
      subject: `${firstName}, demain à ${vars.heure} : le point recrutement de ${lead.company}`,
      body: `Bonjour ${firstName},

Demain ${vars.jour} à ${vars.heure}${vars.mode ? ` ${vars.mode}` : ""}, nous faisons le point sur les recrutements en ${vars.metier} pour ${lead.company}.

En 30 minutes, l'objectif est simple : vérifier la faisabilité de votre projet, identifier si la POEI peut financer la préparation de futurs candidats et convenir de la prochaine étape utile pour votre établissement.

Pour que l'échange soit directement exploitable, gardez seulement ces trois éléments en tête : le poste prioritaire, la date d'arrivée souhaitée et le type de contrat envisagé. Aucun document n'est nécessaire.

En cas d'imprévu de service, utilisez le lien de modification de votre e-mail Calendly ou répondez directement à ce message. Nous préserverons un créneau adapté à votre activité.

L'équipe conseil ParlerEmploi`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.rappelRdvH2) {
    return {
      subject: `${firstName}, rendez-vous dans 2 heures pour ${lead.company}`,
      body: `Bonjour ${firstName},

Votre rendez-vous ParlerEmploi concernant les recrutements de ${lead.company} commence dans environ deux heures, à ${vars.heure}${vars.mode ? ` ${vars.mode}` : ""}.

Un expert ParlerEmploi conduit l'échange à partir des éléments déjà transmis sur vos besoins en ${vars.metier}. À l'issue de l'échange, vous saurez quelle suite est réaliste pour avancer sur le recrutement. Gardez simplement en tête votre poste prioritaire et votre échéance.

Si un coup de feu vous empêche d'être disponible, utilisez le lien de modification dans votre e-mail Calendly ou répondez à ce message avant le créneau.

L'équipe conseil ParlerEmploi`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.rappelQualificationJ1) {
    return {
      subject: `${firstName}, demain à ${vars.heure} : votre point recrutement pour ${lead.company}`,
      body: `Bonjour ${firstName},

Demain ${vars.jour} à ${vars.heure}, un conseiller ParlerEmploi vous appelle au numéro indiqué lors de votre réservation, au sujet des recrutements de ${lead.company}.

En 15 minutes, nous allons clarifier le poste prioritaire, votre calendrier de recrutement et vérifier si le projet peut correspondre à une préparation avant embauche financée dans le cadre de la POEI. L'objectif est de vous faire gagner du temps, pas de vous interrompre pendant le service.

Pour préparer l'appel, gardez simplement en tête le poste à pourvoir, la date souhaitée d'arrivée et les contraintes de votre établissement. Aucun document n'est nécessaire.

En cas d'empêchement, utilisez le lien de modification de votre e-mail Calendly ou répondez directement à ce message.

L'équipe conseil ParlerEmploi`,
    };
  }

  if (eventName === BREVO_LEAD_EVENTS.rappelQualificationH2) {
    return {
      subject: `${firstName}, votre point recrutement commence dans 2 heures`,
      body: `Bonjour ${firstName},

Votre échange de qualification ParlerEmploi commence dans environ deux heures, à ${vars.heure}, au sujet des recrutements de ${lead.company}.

Nous vous appellerons au numéro renseigné lors de votre réservation. En quinze minutes, nous regarderons si une solution de recrutement et de préparation des candidats est pertinente pour votre besoin en ${vars.metier}.

Gardez simplement en tête le poste prioritaire et votre échéance de recrutement. Aucun document n'est nécessaire.

Si un coup de feu vous empêche d'être disponible, utilisez le lien de modification de votre e-mail Calendly ou répondez directement à ce message.

L'équipe conseil ParlerEmploi`,
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

type BrevoApiResult = { messageId?: string; code?: string; message?: string };

async function callBrevo(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; result: BrevoApiResult } | { ok: false; result: BrevoApiResult }> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => ({}))) as BrevoApiResult;
  return response.ok ? { ok: true, result } : { ok: false, result };
}

function emailPayload(
  lead: LeadForBrevo,
  eventName: BrevoLeadEvent,
  message: { subject: string; body: string },
  senderEmail: string,
  senderName: string,
  extra: Record<string, unknown> = {},
) {
  return {
    sender: { name: senderName, email: senderEmail },
    replyTo: { name: "Équipe conseil ParlerEmploi", email: senderEmail },
    to: [{ email: cleanEmail(lead.email)!, name: lead.contact_name || lead.company }],
    subject: message.subject,
    htmlContent: brandedHtml(message.body),
    textContent: message.body,
    tags: ["poei_restauration", eventName],
    headers: { "X-Mailin-custom": `lead_ref:${leadReference(lead.lead_no) ?? lead.id}|event:${eventName}` },
    ...extra,
  };
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

  const message = brevoMessageFor(params.eventName, params.lead, params.settings);
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || "contact@parleremploi.fr";
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ParlerEmploi Formation";

  try {
    const response = await callBrevo(apiKey, emailPayload(params.lead, params.eventName, message, senderEmail, senderName));
    if (!response.ok) {
      console.error(`[brevo] ${params.eventName} delivery failed`, response.result);
      return { sent: false, reason: "delivery_failed" };
    }

    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "note",
      outcome: "autre",
      note: `${marker} Email envoyé via Brevo${response.result.messageId ? ` (${response.result.messageId})` : ""}.`,
    });
    if (error) console.error(`[brevo] ${params.eventName} journalisation impossible`, error.message);
    return { sent: true, messageId: response.result.messageId ?? null };
  } catch (error) {
    console.error(`[brevo] ${params.eventName} delivery failed`, error);
    return { sent: false, reason: "delivery_failed" };
  }
}

/** Programmes an exact transactional reminder in Brevo (UTC, maximum 72 hours ahead). */
export async function scheduleBrevoLeadEvent(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    lead: LeadForBrevo;
    settings: LeadSettings;
    eventName: BrevoLeadEvent;
    scheduledAt: string;
    batchId?: string;
  },
): Promise<DispatchResult & { batchId?: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const email = cleanEmail(params.lead.email);
  if (!apiKey) return { sent: false, reason: "not_configured" };
  if (!email) return { sent: false, reason: "no_email" };
  const scheduledMs = Date.parse(params.scheduledAt);
  const leadMs = scheduledMs - Date.now();
  if (!Number.isFinite(scheduledMs) || leadMs < MINIMUM_SCHEDULE_LEAD_MS || leadMs > BREVO_SCHEDULE_WINDOW_MS) {
    return { sent: false, reason: "delivery_failed" };
  }

  const batchId = params.batchId ?? randomUUID();
  const message = brevoMessageFor(params.eventName, params.lead, params.settings);
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || "contact@parleremploi.fr";
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ParlerEmploi Formation";

  try {
    const response = await callBrevo(apiKey, emailPayload(params.lead, params.eventName, message, senderEmail, senderName, {
      scheduledAt: new Date(scheduledMs).toISOString(),
      batchId,
    }));
    if (!response.ok) {
      console.error(`[brevo] ${params.eventName} scheduling failed`, response.result);
      return { sent: false, reason: "delivery_failed" };
    }
    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "note",
      outcome: "autre",
      note: `${deliveryMarker(params.eventName)} Email programmé via Brevo pour ${new Date(scheduledMs).toISOString()} (batch ${batchId})${response.result.messageId ? ` (${response.result.messageId})` : ""}.`,
    });
    if (error) console.error(`[brevo] ${params.eventName} journalisation impossible`, error.message);
    return { sent: true, messageId: response.result.messageId ?? null, batchId };
  } catch (error) {
    console.error(`[brevo] ${params.eventName} scheduling failed`, error);
    return { sent: false, reason: "delivery_failed" };
  }
}

/** Cancels a Brevo scheduled batch when a Calendly appointment is moved or canceled. */
export async function cancelBrevoScheduledBatch(batchId: string | null | undefined): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey || !batchId) return false;
  try {
    const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(batchId)}`, {
      method: "DELETE",
      headers: { accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      console.error(`[brevo] scheduled batch cancellation failed: ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[brevo] scheduled batch cancellation failed", error);
    return false;
  }
}

/**
 * Queues J-1 and H-2 reminders that are presently within Brevo's 72-hour
 * scheduling window. The caller persists the returned batch identifiers on the lead.
 */
export async function scheduleBrevoAppointmentReminders(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    lead: LeadForBrevo;
    settings: LeadSettings;
    kind: AppointmentReminderKind;
    appointmentAt: string;
    now?: Date;
  },
): Promise<{ scheduled: number; skipped: number; patch: Partial<Record<ReminderBatchColumn, string>> }> {
  const plans = appointmentReminderPlans(params.kind, params.appointmentAt, params.now);
  if (!plans.length) return { scheduled: 0, skipped: 0, patch: {} };

  const patch: Partial<Record<ReminderBatchColumn, string>> = {};
  let scheduled = 0;
  let skipped = 0;
  const reminderLead: LeadForBrevo = {
    ...params.lead,
    rdv_at: params.appointmentAt,
    rdv_mode: params.kind === "qualification" ? "telephone" : params.lead.rdv_mode,
  };

  for (const plan of plans) {
    if (params.lead[plan.batchColumn]) {
      skipped += 1;
      continue;
    }
    const result = await scheduleBrevoLeadEvent(supabase, {
      orgId: params.orgId,
      lead: reminderLead,
      settings: params.settings,
      eventName: plan.eventName,
      scheduledAt: plan.scheduledAt,
    });
    if (result.sent && result.batchId) {
      scheduled += 1;
      patch[plan.batchColumn] = result.batchId;
    } else {
      skipped += 1;
    }
  }
  return { scheduled, skipped, patch };
}

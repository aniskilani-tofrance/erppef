import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { automationsEnabled, leadVars, renderSms, type LeadSettings, type SmsTemplateCode } from "@/lib/leads/templates";
import type { LeadForBrevo } from "@/lib/leads/brevo";

export type TwilioSmsReason =
  | "not_configured"
  | "automations_off"
  | "suppressed" // opposition du prospect ou numéro déjà reconnu invalide
  | "no_phone"
  | "already_sent"
  | "invalid_number" // Twilio refuse le numéro : plus aucun SMS automatique vers cette fiche
  | "opt_out" // le destinataire a répondu STOP à Twilio
  | "delivery_failed";

export type TwilioSmsResult =
  | { sent: true; sid: string | null }
  | { sent: false; reason: TwilioSmsReason };

// Codes d'erreur Twilio qui désignent le numéro lui-même, pas une panne passagère.
// 21211 numéro invalide · 21214 injoignable · 21217 hors zone · 21408 pays non autorisé
// 21612 non routable · 21614 pas un mobile. 21610 = le destinataire a envoyé STOP.
const INVALID_NUMBER_CODES = new Set([21211, 21214, 21217, 21408, 21612, 21614]);
const OPT_OUT_CODE = 21610;

/** Plus aucun SMS automatique vers cette fiche : opposition, ou numéro déjà refusé par Twilio. */
export function smsSuppressed(lead: Pick<LeadForBrevo, "opt_out_at" | "phone_status">): boolean {
  return Boolean(lead.opt_out_at) || lead.phone_status === "invalide";
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim(),
  );
}

// Aucune restriction horaire : les messages de ce module sont transactionnels, ils
// répondent à une action que le restaurateur vient d'accomplir — formulaire rempli,
// créneau réservé, rendez-vous déplacé. Les horaires légaux français encadrent la
// prospection commerciale, pas ces réponses. Un restaurateur qui s'inscrit à minuit
// après son service reçoit donc son accusé de réception dans la seconde. Décision
// d'Anis du 19/09/2026, en remplacement d'une plage 08h00-21h30 qui retardait tout.

function deliveryMarker(code: SmsTemplateCode): string {
  return `[twilio:${code}]`;
}

/** Sends one approved lead SMS, records its provider SID, and is idempotent by lead + template code. */
export async function dispatchTwilioLeadSms(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    lead: LeadForBrevo;
    settings: LeadSettings;
    code: SmsTemplateCode;
    byUserId?: string | null;
    automatic?: boolean;
  },
): Promise<TwilioSmsResult> {
  if (!twilioConfigured()) return { sent: false, reason: "not_configured" };
  // Un envoi automatique n'a lieu que si la direction a armé les automatismes.
  // Les envois déclenchés à la main par un conseiller ne sont jamais bloqués.
  if (params.automatic && !automationsEnabled(params.settings)) return { sent: false, reason: "automations_off" };
  if (smsSuppressed(params.lead)) return { sent: false, reason: "suppressed" };
  const phoneDigits = toWhatsAppNumber(params.lead.phone);
  if (!phoneDigits) return { sent: false, reason: "no_phone" };

  const marker = deliveryMarker(params.code);
  const { data: prior } = await supabase
    .from("employer_lead_events")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("lead_id", params.lead.id)
    .ilike("note", `%${marker}%`)
    .limit(1);
  if (prior?.[0]) return { sent: false, reason: "already_sent" };

  const body = renderSms(params.code, leadVars(params.lead, params.settings, "Un conseiller ParlerEmploi"));
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID!.trim();
  const form = new URLSearchParams({
    To: `+${phoneDigits}`,
    Body: body,
    MessagingServiceSid: serviceSid,
  });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!response.ok) {
      console.error(`[twilio] ${params.code} delivery failed: ${response.status}`, result);
      // Un numéro refusé ou un STOP n'est pas une panne : on le note sur la fiche pour
      // que plus aucun SMS automatique ne parte, et le journal dit pourquoi.
      if (result.code != null && INVALID_NUMBER_CODES.has(result.code)) {
        await supabase.from("employer_leads").update({ phone_status: "invalide" }).eq("id", params.lead.id).eq("org_id", params.orgId);
        await supabase.from("employer_lead_events").insert({
          org_id: params.orgId,
          lead_id: params.lead.id,
          kind: "note",
          outcome: "autre",
          note: `[twilio-retour:invalide] Numéro refusé par Twilio (erreur ${result.code}) : plus aucun SMS automatique. Vérifier le numéro avec le restaurateur.`,
        });
        return { sent: false, reason: "invalid_number" };
      }
      if (result.code === OPT_OUT_CODE) {
        await supabase.from("employer_leads").update({ opt_out_at: new Date().toISOString() }).eq("id", params.lead.id).eq("org_id", params.orgId);
        await supabase.from("employer_lead_events").insert({
          org_id: params.orgId,
          lead_id: params.lead.id,
          kind: "note",
          outcome: "autre",
          note: `[twilio-retour:stop] Le restaurateur a répondu STOP à nos SMS : opposition enregistrée, plus aucun message automatique.`,
        });
        return { sent: false, reason: "opt_out" };
      }
      return { sent: false, reason: "delivery_failed" };
    }

    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "sms",
      outcome: "envoye",
      by_user_id: params.byUserId ?? null,
      note: `${marker} SMS envoyé via Twilio${result.sid ? ` (${result.sid})` : ""}.`,
    });
    if (error) console.error(`[twilio] ${params.code} journalisation impossible`, error.message);
    return { sent: true, sid: result.sid ?? null };
  } catch (error) {
    console.error(`[twilio] ${params.code} delivery failed`, error);
    return { sent: false, reason: "delivery_failed" };
  }
}

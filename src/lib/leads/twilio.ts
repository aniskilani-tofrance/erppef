import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { automationsEnabled, leadVars, renderSms, type LeadSettings, type SmsTemplateCode } from "@/lib/leads/templates";
import type { LeadForBrevo } from "@/lib/leads/brevo";

export type TwilioSmsResult =
  | { sent: true; sid: string | null }
  | { sent: false; reason: "not_configured" | "automations_off" | "no_phone" | "already_sent" | "delivery_failed" };

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

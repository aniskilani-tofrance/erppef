import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { leadVars, renderSms, type LeadSettings, type SmsTemplateCode } from "@/lib/leads/templates";
import type { LeadForBrevo } from "@/lib/leads/brevo";

export type TwilioSmsResult =
  | { sent: true; sid: string | null }
  | { sent: false; reason: "not_configured" | "no_phone" | "already_sent" | "outside_sending_window" | "delivery_failed" };

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim(),
  );
}

/**
 * Conservative window for automated traffic to French businesses. Manual calls
 * remain available to the team, but the server never starts an automatic SMS
 * before 08:00 or at/after 21:30 Paris time.
 */
export function isFrenchSmsSendingWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "99");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "99");
  const minutes = hour * 60 + minute;
  return minutes >= 8 * 60 && minutes < 21 * 60 + 30;
}

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
  const phoneDigits = toWhatsAppNumber(params.lead.phone);
  if (!phoneDigits) return { sent: false, reason: "no_phone" };
  if (params.automatic && !isFrenchSmsSendingWindow()) return { sent: false, reason: "outside_sending_window" };

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

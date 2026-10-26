import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhone, toWhatsAppNumber } from "@/lib/admission/phone";
import { formatSetterPhone, manualOnlyLead, type LeadSettings } from "@/lib/leads/templates";
import { sendTwilioSms, twilioConfigured } from "@/lib/leads/twilio";
import type { LeadForBrevo } from "@/lib/leads/brevo";

// Alerte SMS au setter : chaque nouveau lead reçu par le webhook (landing, Meta via Make,
// Brevo) prévient le setter sur son téléphone dans la minute, en plus de l'e-mail de
// notification. Un lead rappelé dans les 15 minutes se qualifie bien mieux qu'un lead
// rappelé le lendemain.
//
// Message interne : il part au numéro des Réglages (« Téléphone du setter »), jamais au
// restaurateur. Il ne dépend donc pas de l'interrupteur des envois automatiques au
// prospect, mais de son propre réglage « Alerte SMS au setter », activé par défaut.
// La marque de journal le rend idempotent ; il est noté comme une note d'équipe, pas
// comme un SMS au prospect, pour ne pas compter de tentative de contact.

export const SETTER_ALERT_MARKER = "[twilio:alerte_setter]";

export type SetterAlertResult =
  | { sent: true; sid: string | null }
  | { sent: false; reason: "disabled" | "manual_source" | "no_setter_phone" | "not_configured" | "already_sent" | "delivery_failed" };

/** Vrai sauf si la direction a explicitement coupé l'alerte dans les réglages. */
export function setterAlertEnabled(settings: Pick<LeadSettings, "setterSmsAlert">): boolean {
  return settings.setterSmsAlert !== "off";
}

function clip(value: string | null | undefined, max: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** « Nouveau lead POEI : Le Comptoir (Saint-Ouen), Sonia Amrani 06 12 34 56 78. Rappelle sous 15 min. https://… » */
export function setterAlertText(
  lead: Pick<LeadForBrevo, "company" | "city" | "postal_code" | "contact_name" | "phone">,
  leadUrl: string,
): string {
  const entreprise = clip(lead.company, 60) || "Restaurant sans nom";
  const ville = clip(lead.city, 40) || clip(lead.postal_code, 10);
  const contact = [clip(lead.contact_name, 40), lead.phone ? formatPhone(lead.phone) : ""].filter(Boolean).join(" ");
  return `Nouveau lead POEI : ${entreprise}${ville ? ` (${ville})` : ""}${contact ? `, ${contact}` : ""}. Rappelle sous 15 min. ${leadUrl}`;
}

/**
 * Prévient le setter d'un nouveau lead entrant. À n'appeler que pour une fiche créée par
 * le webhook (jamais pour une fiche saisie à la main ni un doublon). Ne lève jamais :
 * la réception du lead ne doit pas dépendre de Twilio.
 */
export async function alertSetterOfNewLead(
  supabase: SupabaseClient,
  params: { orgId: string; lead: LeadForBrevo; settings: LeadSettings; leadUrl: string },
): Promise<SetterAlertResult> {
  try {
    if (!setterAlertEnabled(params.settings)) return { sent: false, reason: "disabled" };
    // Terrain, prospection : le setter a créé la fiche lui-même, rien à lui signaler.
    if (manualOnlyLead(params.lead)) return { sent: false, reason: "manual_source" };
    const to = toWhatsAppNumber(params.settings.setterPhone);
    if (!to) {
      console.warn("[alerte setter] aucun téléphone du setter dans les réglages : alerte non envoyée");
      return { sent: false, reason: "no_setter_phone" };
    }
    if (!twilioConfigured()) {
      console.warn("[alerte setter] Twilio non configuré : alerte non envoyée");
      return { sent: false, reason: "not_configured" };
    }

    const { data: prior } = await supabase
      .from("employer_lead_events")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("lead_id", params.lead.id)
      .ilike("note", `%${SETTER_ALERT_MARKER}%`)
      .limit(1);
    if (prior?.[0]) return { sent: false, reason: "already_sent" };

    const delivery = await sendTwilioSms({ to, body: setterAlertText(params.lead, params.leadUrl), label: "alerte_setter" });
    if (!delivery.ok) return { sent: false, reason: "delivery_failed" };

    const { error } = await supabase.from("employer_lead_events").insert({
      org_id: params.orgId,
      lead_id: params.lead.id,
      kind: "note",
      outcome: null,
      note: `${SETTER_ALERT_MARKER} Alerte SMS envoyée au setter (${formatSetterPhone(params.settings.setterPhone)})${delivery.sid ? ` — ${delivery.sid}` : ""}.`,
    });
    if (error) console.error("[alerte setter] journalisation impossible", error.message);
    return { sent: true, sid: delivery.sid };
  } catch (error) {
    console.error("[alerte setter] envoi impossible", error);
    return { sent: false, reason: "delivery_failed" };
  }
}

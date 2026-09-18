import type { SupabaseClient } from "@supabase/supabase-js";
import { localToUtc, nextDay } from "@/lib/dates";
import { resolveLeadSettings } from "@/lib/leads/templates";
import { dispatchTwilioLeadSms } from "@/lib/leads/twilio";
import { BREVO_LEAD_EVENTS, dispatchBrevoLeadEvent, type LeadForBrevo } from "@/lib/leads/brevo";

export type AutomatedSmsSummary = { sent: number; skipped: number };

type LeadAutomationRow = LeadForBrevo & {
  org_id: string;
  rdv_outcome: string | null;
  next_action: string | null;
  updated_at: string | null;
};

function parisDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 24 * 3_600_000);
  return date.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

async function loadSettingsByOrg(supabase: SupabaseClient, orgIds: string[]) {
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, settings")
    .in("id", [...new Set(orgIds)]);
  return new Map((organizations ?? []).map((org) => [org.id as string, resolveLeadSettings(org.settings)]));
}

/** Sends the transactional J-1 SMS once for each tomorrow appointment. */
export async function sendLeadRdvSms(supabase: SupabaseClient): Promise<AutomatedSmsSummary> {
  const tomorrow = parisDate(1);
  const dayAfter = nextDay(tomorrow);
  const { data: leads } = await supabase
    .from("employer_leads")
    .select("*")
    .eq("status", "rdv_pris")
    .gte("rdv_at", localToUtc(tomorrow, "00:00"))
    .lt("rdv_at", localToUtc(dayAfter, "00:00"));
  if (!leads?.length) return { sent: 0, skipped: 0 };

  const settingsByOrg = await loadSettingsByOrg(supabase, leads.map((lead) => lead.org_id as string));
  let sent = 0;
  let skipped = 0;
  for (const lead of leads) {
    const settings = settingsByOrg.get(lead.org_id as string);
    if (!settings) {
      skipped += 1;
      continue;
    }
    const result = await dispatchTwilioLeadSms(supabase, {
      orgId: lead.org_id as string,
      lead: lead as LeadForBrevo,
      settings,
      code: "rappel_rdv",
      automatic: true,
    });
    if (result.sent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

export function deferredSmsCode(lead: Pick<LeadAutomationRow, "status" | "rdv_outcome" | "next_action">) {
  // L'accusé de réception d'un lead encore « nouveau » n'est volontairement PAS repris ici :
  // il obéit au délai de courtoisie de sendPendingLeadIntro, qui laisse au restaurateur le
  // temps de réserver son créneau dans le Calendly de la landing avant qu'on l'y invite.
  if (lead.rdv_outcome === "no_show") return "no_show" as const;
  if (lead.status === "rdv_pris") return "confirmation_rdv" as const;
  if (lead.status === "a_rappeler" && /calendly|qualification/i.test(lead.next_action ?? "")) {
    return "qualification_reservee" as const;
  }
  return null;
}

/**
 * Replays only recent customer-facing events missed outside the legal sending
 * window. Provider markers make every replay idempotent.
 */
export async function sendDeferredLeadSms(supabase: SupabaseClient): Promise<AutomatedSmsSummary> {
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const { data: leads } = await supabase
    .from("employer_leads")
    .select("*")
    .gte("updated_at", since)
    .in("status", ["a_rappeler", "rdv_pris"])
    .limit(200);
  if (!leads?.length) return { sent: 0, skipped: 0 };

  const candidates = (leads as LeadAutomationRow[])
    .map((lead) => ({ lead, code: deferredSmsCode(lead) }))
    .filter((candidate): candidate is { lead: LeadAutomationRow; code: NonNullable<ReturnType<typeof deferredSmsCode>> } => Boolean(candidate.code));
  if (!candidates.length) return { sent: 0, skipped: 0 };

  const settingsByOrg = await loadSettingsByOrg(supabase, candidates.map(({ lead }) => lead.org_id));
  let sent = 0;
  let skipped = 0;
  for (const { lead, code } of candidates) {
    const settings = settingsByOrg.get(lead.org_id);
    if (!settings) {
      skipped += 1;
      continue;
    }
    const result = await dispatchTwilioLeadSms(supabase, {
      orgId: lead.org_id,
      lead,
      settings,
      code,
      automatic: true,
    });
    if (result.sent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

/** Délai laissé au restaurateur pour réserver son créneau dans le Calendly de la landing. */
export const DELAI_AVANT_INVITATION_MS = 10 * 60_000;

/**
 * L'accusé de réception invite à choisir un créneau de qualification. Il ne doit donc
 * partir que vers ceux qui n'en ont pas choisi : sur la landing, le formulaire s'efface
 * une fois validé et le Calendly apparaît à sa place, dans la même section, si bien que
 * la plupart réservent dans la minute sans même changer de page. On leur laisse dix
 * minutes, puis on écrit à ceux qui sont partis sans réserver. Les marques de journal
 * rendent l'opération idempotente, et ceux qui réservent entre-temps ne reçoivent rien.
 */
export async function sendPendingLeadIntro(supabase: SupabaseClient): Promise<AutomatedSmsSummary> {
  const limite = new Date(Date.now() - DELAI_AVANT_INVITATION_MS).toISOString();
  const { data: leads } = await supabase
    .from("employer_leads")
    .select("*")
    .eq("status", "nouveau")
    .is("qualification_at", null)
    .is("rdv_at", null)
    .lte("received_at", limite)
    .gte("received_at", new Date(Date.now() - 36 * 3_600_000).toISOString())
    .limit(200);
  if (!leads?.length) return { sent: 0, skipped: 0 };

  const settingsByOrg = await loadSettingsByOrg(supabase, leads.map((lead) => lead.org_id as string));
  let sent = 0;
  let skipped = 0;
  for (const lead of leads as LeadAutomationRow[]) {
    const settings = settingsByOrg.get(lead.org_id);
    if (!settings) {
      skipped += 1;
      continue;
    }
    const email = await dispatchBrevoLeadEvent(supabase, {
      orgId: lead.org_id,
      lead,
      settings,
      eventName: BREVO_LEAD_EVENTS.nouveau,
    });
    const sms = await dispatchTwilioLeadSms(supabase, {
      orgId: lead.org_id,
      lead,
      settings,
      code: "demande_recue",
      automatic: true,
    });
    if (email.sent || sms.sent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

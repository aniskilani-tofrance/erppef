import type { SupabaseClient } from "@supabase/supabase-js";
import { localToUtc, nextDay } from "@/lib/dates";
import { resolveLeadSettings } from "@/lib/leads/templates";
import { dispatchTwilioLeadSms } from "@/lib/leads/twilio";
import type { LeadForBrevo } from "@/lib/leads/brevo";

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
  if (lead.status === "nouveau") return "demande_recue" as const;
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
    .in("status", ["nouveau", "a_rappeler", "rdv_pris"])
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

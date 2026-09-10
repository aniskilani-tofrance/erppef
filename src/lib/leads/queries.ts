import type { SupabaseClient } from "@supabase/supabase-js";
import { hoursToFirstContact, suggestNextAction, type NextAction } from "@/lib/leads/cadence";
import { isFinalStatus, potentialAmount } from "@/lib/leads/status";
import { resolveLeadSettings, type LeadSettings } from "@/lib/leads/templates";

// Lecture partagée du module Leads (pages, dashboard setter, export). Serveur uniquement.

export type LeadRow = {
  id: string;
  lead_no: number | null;
  received_at: string;
  source: string;
  campaign: string | null;
  company: string;
  segment: string;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  postal_code: string | null;
  positions: string | null;
  positions_count: number;
  contract_type: string;
  hours_per_week: number | null;
  hiring_horizon: string;
  hiring_deadline: string | null;
  decision_maker: boolean | null;
  haccp_status: string;
  covers: string | null;
  team_size: number | null;
  pain: string | null;
  score: string | null;
  status: string;
  lost_reason: string | null;
  offer: string | null;
  owner_user_id: string | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  attempts: number;
  next_action: string | null;
  next_action_on: string | null;
  rdv_at: string | null;
  rdv_mode: string | null;
  rdv_outcome: string | null;
  rdv_reminder_sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const LEAD_COLUMNS =
  "id, lead_no, received_at, source, campaign, company, segment, contact_name, contact_role, phone, email, city, postal_code, " +
  "positions, positions_count, contract_type, hours_per_week, hiring_horizon, hiring_deadline, decision_maker, haccp_status, covers, " +
  "team_size, pain, score, status, lost_reason, offer, owner_user_id, first_contact_at, last_contact_at, attempts, next_action, " +
  "next_action_on, rdv_at, rdv_mode, rdv_outcome, rdv_reminder_sent_at, notes, created_at, updated_at";

export type LeadEventRow = {
  id: string;
  lead_id: string;
  at: string;
  kind: string;
  outcome: string | null;
  note: string | null;
  by_user_id: string | null;
};

export type Owner = { userId: string; name: string; role: string };

export function todayParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}
export function dateParis(iso: string | null | undefined): string | null {
  return iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : null;
}

export async function loadOwners(supabase: SupabaseClient, orgId: string): Promise<Owner[]> {
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role, profiles(full_name)")
    .eq("org_id", orgId)
    .in("role", ["admin", "coordinator", "setter"]);
  return (data ?? []).map((m) => {
    const p = m.profiles as { full_name: string | null } | { full_name: string | null }[] | null;
    const name = (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? "Membre";
    return { userId: m.user_id as string, name, role: m.role as string };
  });
}

export async function loadLeadSettings(supabase: SupabaseClient, orgId: string): Promise<LeadSettings> {
  const { data } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
  return resolveLeadSettings(data?.settings ?? null);
}

export async function loadSenderFirstName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const full = (data?.full_name as string | null | undefined)?.trim();
  return full ? full.split(/\s+/)[0] : null;
}

export function ownerName(owners: Owner[], userId: string | null): string | null {
  return owners.find((o) => o.userId === userId)?.name ?? null;
}

// Prochaine action affichée : celle notée sur la fiche si elle existe, sinon la cadence.
export function nextActionFor(lead: LeadRow, today: string): NextAction | null {
  if (isFinalStatus(lead.status)) return null;
  if (lead.next_action && lead.next_action_on) {
    return { label: lead.next_action, on: lead.next_action_on, kind: "suivi", overdue: lead.next_action_on < today };
  }
  return suggestNextAction({
    status: lead.status,
    attempts: lead.attempts,
    firstContactOn: dateParis(lead.first_contact_at),
    rdvOn: dateParis(lead.rdv_at),
    rdvReminderSent: Boolean(lead.rdv_reminder_sent_at),
    today,
  });
}

// Tri par urgence : nouveaux jamais rappelés (les plus anciens d'abord), puis actions en retard,
// puis actions du jour, puis le reste par date de réception.
export function urgencyKey(lead: LeadRow, today: string): string {
  if (isFinalStatus(lead.status)) return `9-${lead.received_at}`;
  if (lead.status === "nouveau" && lead.attempts === 0) return `0-${lead.received_at}`;
  const next = nextActionFor(lead, today);
  if (next?.overdue) return `1-${next.on}`;
  if (next && next.on === today) return `2-${next.on}`;
  return `3-${next?.on ?? "9999"}-${lead.received_at}`;
}

export type TodayBuckets = {
  nouveaux: { lead: LeadRow; hours: number }[]; // jamais rappelés, avec l'âge en heures
  relances: { lead: LeadRow; action: NextAction }[]; // action due aujourd'hui ou en retard
  rappels: LeadRow[]; // RDV demain sans SMS de rappel envoyé
  rdvs: LeadRow[]; // RDV aujourd'hui
};

export function todayBuckets(leads: LeadRow[], today: string, now: Date = new Date()): TodayBuckets {
  const tomorrow = addDays(today, 1);
  const out: TodayBuckets = { nouveaux: [], relances: [], rappels: [], rdvs: [] };
  for (const l of leads) {
    if (isFinalStatus(l.status)) continue;
    const rdvOn = dateParis(l.rdv_at);
    if (l.status === "rdv_pris" && rdvOn === today) out.rdvs.push(l);
    if (l.status === "rdv_pris" && rdvOn === tomorrow && !l.rdv_reminder_sent_at) out.rappels.push(l);
    if (l.status === "nouveau" && l.attempts === 0) {
      out.nouveaux.push({ lead: l, hours: (now.getTime() - Date.parse(l.received_at)) / 3_600_000 });
      continue;
    }
    const action = nextActionFor(l, today);
    if (action && action.on <= today && action.kind !== "rdv") out.relances.push({ lead: l, action });
  }
  out.nouveaux.sort((a, b) => b.hours - a.hours);
  out.relances.sort((a, b) => a.action.on.localeCompare(b.action.on));
  out.rdvs.sort((a, b) => (a.rdv_at ?? "").localeCompare(b.rdv_at ?? ""));
  return out;
}

export type Kpis = {
  received7: number;
  received30: number;
  contactedUnder24h: number; // %
  contactedBase: number;
  qualified: number;
  rdvTaken: number;
  rdvHeld: number;
  showRate: number | null; // %
  won: number;
  lost: number;
  outOfScope: number;
  pipelineAmount: number; // € potentiel (qualifié → proposition)
  byOffer: Record<string, number>;
  bySegment: Record<string, number>;
  active: number;
};

export function computeKpis(leads: LeadRow[], today: string): Kpis {
  const d7 = addDays(today, -7);
  const d30 = addDays(today, -30);
  const k: Kpis = {
    received7: 0, received30: 0, contactedUnder24h: 0, contactedBase: 0, qualified: 0, rdvTaken: 0, rdvHeld: 0,
    showRate: null, won: 0, lost: 0, outOfScope: 0, pipelineAmount: 0, byOffer: {}, bySegment: {}, active: 0,
  };
  let under24 = 0;
  let noShow = 0;
  for (const l of leads) {
    const recv = dateParis(l.received_at) ?? today;
    if (recv >= d7) k.received7++;
    if (recv >= d30) k.received30++;
    const ageH = (Date.now() - Date.parse(l.received_at)) / 3_600_000;
    if (recv >= d30 && (l.first_contact_at || ageH > 24)) {
      k.contactedBase++;
      const h = hoursToFirstContact(l.received_at, l.first_contact_at);
      if (h != null && h <= 24) under24++;
    }
    const rank = ["nouveau", "a_rappeler", "contacte", "qualifie", "rdv_pris", "rdv_tenu", "proposition", "gagne"].indexOf(l.status);
    if (rank >= 3) k.qualified++;
    if (rank >= 4) k.rdvTaken++;
    if (rank >= 5) k.rdvHeld++;
    if (l.rdv_outcome === "no_show") noShow++;
    if (l.status === "gagne") k.won++;
    if (l.status === "perdu") k.lost++;
    if (l.status === "hors_cible") k.outOfScope++;
    if (["qualifie", "rdv_pris", "rdv_tenu", "proposition"].includes(l.status)) k.pipelineAmount += potentialAmount(l.positions_count);
    if (!isFinalStatus(l.status)) k.active++;
    if (l.offer) k.byOffer[l.offer] = (k.byOffer[l.offer] ?? 0) + 1;
    k.bySegment[l.segment] = (k.bySegment[l.segment] ?? 0) + 1;
  }
  k.contactedUnder24h = k.contactedBase ? Math.round((under24 / k.contactedBase) * 100) : 0;
  k.showRate = k.rdvHeld + noShow ? Math.round((k.rdvHeld / (k.rdvHeld + noShow)) * 100) : null;
  return k;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

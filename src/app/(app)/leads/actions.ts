"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { localToUtc } from "@/lib/dates";
import {
  CONTRACT_TYPE_CODES, EVENT_KIND_CODES, EVENT_OUTCOME_CODES, HACCP_STATUS_CODES, HIRING_HORIZON_CODES,
  LEAD_OFFER_CODES, LEAD_SCORE_CODES, LEAD_SEGMENT_CODES, LEAD_SOURCE_CODES, LEAD_STATUS_CODES, RDV_MODE_CODES,
} from "@/lib/leads/status";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/leads/templates";

// Rôles autorisés sur les leads : la direction (admin, coordination) et le setter.
const LEAD_ROLES = ["admin", "coordinator", "setter"] as const;

export type ActionResult = { ok: true } | { ok: false; error: string };
export type LeadResult = { ok: true; id: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = z.string().trim();
const optText = z.string().trim().nullable().optional().transform((v) => (v ? v : null));

function revalidateLeads(id?: string | null) {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
}

// ── Fiche ────────────────────────────────────────────────────────────────────
const leadSchema = z.object({
  id: uuid.optional(),
  company: text.min(1, "Le nom du restaurant est obligatoire"),
  segment: z.enum(LEAD_SEGMENT_CODES).default("inconnu"),
  source: z.enum(LEAD_SOURCE_CODES).default("formulaire_meta"),
  campaign: optText,
  contactName: optText,
  contactRole: optText,
  phone: optText,
  email: optText,
  city: optText,
  postalCode: optText,
  positions: optText,
  positionsCount: z.number().int().min(0).max(200).default(1),
  contractType: z.enum(CONTRACT_TYPE_CODES).default("inconnu"),
  hoursPerWeek: z.number().int().min(1).max(60).nullable().optional(),
  hiringHorizon: z.enum(HIRING_HORIZON_CODES).default("inconnu"),
  hiringDeadline: optText,
  decisionMaker: z.boolean().nullable().optional(),
  haccpStatus: z.enum(HACCP_STATUS_CODES).default("inconnu"),
  covers: optText,
  teamSize: z.number().int().min(0).max(10000).nullable().optional(),
  pain: optText,
  score: z.enum(LEAD_SCORE_CODES).nullable().optional(),
  offer: z.enum(LEAD_OFFER_CODES).nullable().optional(),
  ownerUserId: uuid.nullable().optional(),
  notes: optText,
  receivedAt: z.string().nullable().optional(), // ISO ; à la création seulement
});
export type LeadInput = z.input<typeof leadSchema>;

export async function upsertLead(raw: LeadInput): Promise<LeadResult> {
  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();

  const row = {
    company: d.company,
    segment: d.segment,
    source: d.source,
    campaign: d.campaign,
    contact_name: d.contactName,
    contact_role: d.contactRole,
    phone: d.phone,
    email: d.email,
    city: d.city,
    postal_code: d.postalCode,
    positions: d.positions,
    positions_count: d.positionsCount,
    contract_type: d.contractType,
    hours_per_week: d.hoursPerWeek ?? null,
    hiring_horizon: d.hiringHorizon,
    hiring_deadline: d.hiringDeadline,
    decision_maker: d.decisionMaker ?? null,
    haccp_status: d.haccpStatus,
    covers: d.covers,
    team_size: d.teamSize ?? null,
    pain: d.pain,
    score: d.score ?? null,
    offer: d.offer ?? null,
    owner_user_id: d.ownerUserId === undefined ? undefined : d.ownerUserId,
    notes: d.notes,
  };

  if (d.id) {
    const { error } = await supabase.from("employer_leads").update(row).eq("id", d.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    revalidateLeads(d.id);
    return { ok: true, id: d.id };
  }

  const { data, error } = await supabase
    .from("employer_leads")
    .insert({
      ...row,
      org_id: orgId,
      owner_user_id: d.ownerUserId ?? userId,
      created_by: userId,
      ...(d.receivedAt ? { received_at: d.receivedAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: translatePgError(error ?? { message: "Création impossible" }) };
  revalidateLeads(data.id);
  return { ok: true, id: data.id };
}

export async function deleteLead(raw: { leadId: string }): Promise<ActionResult> {
  const parsed = z.object({ leadId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("employer_leads").delete().eq("id", parsed.data.leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateLeads();
  return { ok: true };
}

// ── Journal + statut + prochaine action ──────────────────────────────────────
const eventSchema = z.object({
  leadId: uuid,
  kind: z.enum(EVENT_KIND_CODES),
  outcome: z.enum(EVENT_OUTCOME_CODES).nullable(),
  note: z.string().nullable(),
  // Statut choisi dans le dialog (pré-rempli d'après le résultat) ; null = ne pas toucher.
  status: z.enum(LEAD_STATUS_CODES).nullable(),
  lostReason: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  nextActionOn: day.nullable().optional(),
});

export async function logLeadEvent(raw: z.infer<typeof eventSchema>): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase.from("employer_lead_events").insert({
    org_id: orgId,
    lead_id: d.leadId,
    kind: d.kind,
    outcome: d.outcome,
    note: d.note?.trim() || null,
    by_user_id: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };

  const patch: Record<string, unknown> = {};
  if (d.status) patch.status = d.status;
  if (d.status === "perdu") patch.lost_reason = d.lostReason?.trim() || null;
  if (d.nextAction !== undefined) patch.next_action = d.nextAction?.trim() || null;
  if (d.nextActionOn !== undefined) patch.next_action_on = d.nextActionOn;
  if (d.kind === "sms" && d.outcome === "envoye" && d.note?.startsWith("SMS n°3")) patch.rdv_reminder_sent_at = new Date().toISOString();
  if (Object.keys(patch).length) {
    const { error: e2 } = await supabase.from("employer_leads").update(patch).eq("id", d.leadId).eq("org_id", orgId);
    if (e2) return { ok: false, error: translatePgError(e2) };
  }
  revalidateLeads(d.leadId);
  return { ok: true };
}

export async function setLeadStatus(raw: { leadId: string; status: string; lostReason?: string | null }): Promise<ActionResult> {
  const parsed = z.object({ leadId: uuid, status: z.enum(LEAD_STATUS_CODES), lostReason: z.string().nullable().optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: d.status };
  if (d.status === "perdu") patch.lost_reason = d.lostReason?.trim() || null;
  if (d.status === "gagne" || d.status === "perdu" || d.status === "hors_cible") {
    patch.next_action = null;
    patch.next_action_on = null;
  }
  const { error } = await supabase.from("employer_leads").update(patch).eq("id", d.leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await supabase.from("employer_lead_events").insert({
    org_id: orgId, lead_id: d.leadId, kind: "statut", outcome: null, by_user_id: userId,
    note: `Statut → ${d.status}${d.lostReason ? ` (${d.lostReason})` : ""}`,
  });
  revalidateLeads(d.leadId);
  return { ok: true };
}

export async function setNextAction(raw: { leadId: string; nextAction: string | null; nextActionOn: string | null }): Promise<ActionResult> {
  const parsed = z.object({ leadId: uuid, nextAction: z.string().nullable(), nextActionOn: day.nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employer_leads")
    .update({ next_action: d.nextAction?.trim() || null, next_action_on: d.nextActionOn })
    .eq("id", d.leadId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateLeads(d.leadId);
  return { ok: true };
}

export async function assignLead(raw: { leadId: string; ownerUserId: string | null }): Promise<ActionResult> {
  const parsed = z.object({ leadId: uuid, ownerUserId: uuid.nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employer_leads")
    .update({ owner_user_id: parsed.data.ownerUserId })
    .eq("id", parsed.data.leadId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateLeads(parsed.data.leadId);
  return { ok: true };
}

// ── Rendez-vous avec la direction ────────────────────────────────────────────
const rdvSchema = z.object({
  leadId: uuid,
  date: day,
  time,
  mode: z.enum(RDV_MODE_CODES),
});

export async function setLeadRdv(raw: z.infer<typeof rdvSchema>): Promise<ActionResult> {
  const parsed = rdvSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Date, heure et mode du rendez-vous sont obligatoires" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();
  const rdvAt = localToUtc(d.date, d.time);
  const { error } = await supabase
    .from("employer_leads")
    .update({
      rdv_at: rdvAt,
      rdv_mode: d.mode,
      rdv_outcome: "a_venir",
      rdv_reminder_sent_at: null,
      status: "rdv_pris",
      next_action: "SMS de rappel la veille du RDV (SMS n°3)",
      next_action_on: addDaysIso(d.date, -1),
    })
    .eq("id", d.leadId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await supabase.from("employer_lead_events").insert({
    org_id: orgId, lead_id: d.leadId, kind: "rdv", outcome: "rdv_pose", by_user_id: userId,
    note: `RDV posé le ${d.date.split("-").reverse().join("/")} à ${d.time} (${d.mode})`,
  });
  revalidateLeads(d.leadId);
  return { ok: true };
}

export async function setRdvOutcome(raw: { leadId: string; outcome: "tenu" | "no_show" | "reporte" }): Promise<ActionResult> {
  const parsed = z.object({ leadId: uuid, outcome: z.enum(["tenu", "no_show", "reporte"]) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();
  const patch: Record<string, unknown> =
    d.outcome === "tenu"
      ? { rdv_outcome: "tenu", status: "rdv_tenu", next_action: "Prévenir la direction : proposition à envoyer", next_action_on: today() }
      : d.outcome === "no_show"
        ? { rdv_outcome: "no_show", status: "a_rappeler", next_action: "Recaler le RDV (email n°6 + SMS no-show)", next_action_on: today() }
        : { rdv_outcome: "reporte", rdv_at: null, rdv_mode: null, status: "qualifie", next_action: "Reposer deux créneaux hors service", next_action_on: today() };
  const { error } = await supabase.from("employer_leads").update(patch).eq("id", d.leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await supabase.from("employer_lead_events").insert({
    org_id: orgId, lead_id: d.leadId, kind: "rdv", outcome: d.outcome === "tenu" ? "rdv_tenu" : d.outcome === "no_show" ? "no_show" : "autre",
    by_user_id: userId, note: d.outcome === "reporte" ? "RDV reporté, à reposer" : null,
  });
  revalidateLeads(d.leadId);
  return { ok: true };
}

// ── Import (collage) ─────────────────────────────────────────────────────────
const importRowSchema = z.object({
  company: z.string().min(1),
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  positions: z.string().nullable(),
  positionsCount: z.number().int().nullable(),
  contractType: z.string().nullable(),
  hiringDeadline: z.string().nullable(),
  segment: z.string().nullable(),
  score: z.string().nullable(),
  status: z.string().nullable(),
  source: z.string().nullable(),
  campaign: z.string().nullable(),
  receivedAt: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ImportResult = { ok: true; imported: number } | { ok: false; error: string };

export async function importLeads(raw: { rows: z.infer<typeof importRowSchema>[] }): Promise<ImportResult> {
  const parsed = z.object({ rows: z.array(importRowSchema).min(1).max(500) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Aucune ligne exploitable (le nom du restaurant est obligatoire)." };
  const { orgId, userId } = await requireRole([...LEAD_ROLES]);
  const supabase = await createClient();

  const isCode = <T extends readonly string[]>(codes: T, v: string | null): v is T[number] => !!v && (codes as readonly string[]).includes(v);
  const rows = parsed.data.rows.map((r) => ({
    org_id: orgId,
    created_by: userId,
    owner_user_id: userId,
    company: r.company.trim(),
    contact_name: r.contactName,
    contact_role: r.contactRole,
    phone: r.phone,
    email: r.email,
    city: r.city,
    postal_code: r.postalCode,
    positions: r.positions,
    positions_count: r.positionsCount ?? 1,
    contract_type: isCode(CONTRACT_TYPE_CODES, r.contractType) ? r.contractType : "inconnu",
    hiring_deadline: r.hiringDeadline,
    segment: isCode(LEAD_SEGMENT_CODES, r.segment) ? r.segment : "inconnu",
    score: isCode(LEAD_SCORE_CODES, r.score) ? r.score : null,
    status: isCode(LEAD_STATUS_CODES, r.status) ? r.status : "nouveau",
    source: isCode(LEAD_SOURCE_CODES, r.source) ? r.source : "formulaire_meta",
    campaign: r.campaign,
    notes: r.notes,
    ...(r.receivedAt ? { received_at: `${r.receivedAt}T09:00:00+02:00` } : {}),
  }));

  const { data, error } = await supabase.from("employer_leads").insert(rows).select("id");
  if (error) return { ok: false, error: translatePgError(error) };
  if (data?.length) {
    await supabase.from("employer_lead_events").insert(
      data.map((d) => ({ org_id: orgId, lead_id: d.id, kind: "import", outcome: null, note: "Importé depuis un collage", by_user_id: userId })),
    );
  }
  revalidateLeads();
  return { ok: true, imported: data?.length ?? 0 };
}

// ── Réglages (prochain groupe, Calendly, créneaux) — admin ───────────────────
const settingsSchema = z.object({
  nextGroupLabel: z.string().trim().min(1),
  calendlyUrl: z.string().trim().url(),
  slot1: z.string().trim().min(1),
  slot2: z.string().trim().min(1),
  directorName: z.string().trim().min(1),
  notifyEmail: z.string().trim().email().or(z.literal("")).default(""),
  defaultOwnerUserId: uuid.or(z.literal("")).default(""),
  // Jeton du webhook : "keep" = inchangé, "regenerate" = nouveau, "disable" = fermé
  inboundTokenAction: z.enum(["keep", "regenerate", "disable"]).default("keep"),
});

export async function saveLeadSettings(raw: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Réglages invalides (lien Calendly complet, email de notification valide)." };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
  const current = ((org?.settings as Record<string, unknown> | null)?.leads ?? {}) as Record<string, unknown>;
  const { inboundTokenAction, ...fields } = parsed.data;
  const inboundToken =
    inboundTokenAction === "disable" ? "" : inboundTokenAction === "regenerate" || !current.inboundToken ? newToken() : String(current.inboundToken);
  const settings = { ...((org?.settings as Record<string, unknown>) ?? {}), leads: { ...DEFAULT_LEAD_SETTINGS, ...current, ...fields, inboundToken } };
  const { error } = await supabase.from("organizations").update({ settings }).eq("id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateLeads();
  return { ok: true };
}

function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}
function newToken(): string {
  return randomBytes(24).toString("base64url");
}
function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

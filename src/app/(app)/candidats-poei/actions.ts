"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { learnerRef } from "@/lib/refs";
import { leadRef } from "@/lib/leads/status";
import {
  CANDIDATE_EVENT_KIND_CODES, CANDIDATE_EVENT_OUTCOME_CODES, CANDIDATE_SOURCE_CODES, CANDIDATE_STATUS_CODES, CONSENT_CHANNEL_CODES,
  FT_STATUS_CODES, WORK_PERMIT_CODES, candidateStatusLabel, canMoveTo, isFinalCandidateStatus, splitContactName,
} from "@/lib/poei-candidates/status";

// Rôles : la direction (admin, coordination) et le setter. « Proposer en POEI » depuis
// l'admission est réservé à la direction : le setter ne voit pas les apprenants.
const CANDIDATE_ROLES = ["admin", "coordinator", "setter"] as const;

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CandidateResult = { ok: true; id: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = z.string().trim().nullable().optional().transform((v) => (v ? v : null));

function revalidateCandidates(id?: string | null) {
  revalidatePath("/candidats-poei");
  if (id) revalidatePath(`/candidats-poei/${id}`);
  revalidatePath("/apprenants/admission");
  revalidatePath("/leads");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function journal(supabase: Supabase, orgId: string, candidateId: string, userId: string, kind: string, note: string, outcome: string | null = null) {
  await supabase.from("poei_candidate_events").insert({ org_id: orgId, candidate_id: candidateId, kind, outcome, note, by_user_id: userId });
}

// ── Création depuis l'admission (apprenant de l'association) ─────────────────
export async function proposeLearnerForPoei(raw: { learnerId: string }): Promise<CandidateResult> {
  const parsed = z.object({ learnerId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: existing } = await supabase.from("poei_candidates").select("id").eq("learner_id", parsed.data.learnerId).maybeSingle();
  if (existing) return { ok: true, id: existing.id };

  const { data: l, error: e1 } = await supabase
    .from("learners")
    .select("id, learner_no, first_name, last_name, phone, email, city, level_assessed, entry_need, notes")
    .eq("id", parsed.data.learnerId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (e1 || !l) return { ok: false, error: "Apprenant introuvable." };

  const level = [l.level_assessed ? `Évalué ${l.level_assessed}` : null, l.entry_need ? `Besoin d'entrée : ${l.entry_need}` : null].filter(Boolean).join(" · ") || null;
  const { data, error } = await supabase
    .from("poei_candidates")
    .insert({
      org_id: orgId,
      source: "asso_pef",
      learner_id: l.id,
      first_name: l.first_name && l.first_name !== "?" ? l.first_name : null,
      last_name: l.last_name,
      phone: l.phone,
      email: l.email,
      city: l.city ?? null,
      french_level: level,
      notes: l.notes ? `Fiche apprenant : ${l.notes}` : null,
      owner_user_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: translatePgError(error ?? { message: "Création impossible" }) };
  await journal(supabase, orgId, data.id, userId, "creation", `Proposé(e) en POEI depuis l'admission (${learnerRef(l.learner_no)}) — consentement à recueillir`);
  revalidateCandidates(data.id);
  return { ok: true, id: data.id };
}

// ── Création depuis un lead resto mal qualifié (une personne, pas un employeur) ─
export async function convertLeadToCandidate(raw: { leadId: string }): Promise<CandidateResult> {
  const parsed = z.object({ leadId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();

  const { data: existing } = await supabase.from("poei_candidates").select("id").eq("from_lead_id", parsed.data.leadId).maybeSingle();
  if (existing) return { ok: true, id: existing.id };

  const { data: lead, error: e1 } = await supabase
    .from("employer_leads")
    .select("id, lead_no, company, contact_name, phone, email, city, positions, notes, pain")
    .eq("id", parsed.data.leadId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (e1 || !lead) return { ok: false, error: "Lead introuvable." };

  // Dans un formulaire employeur rempli par un candidat, « restaurant » contient souvent
  // son propre nom : on le prend à défaut de contact.
  const { firstName, lastName } = splitContactName(lead.contact_name ?? lead.company);
  const notes = [
    `Requalifié depuis le lead ${leadRef(lead.lead_no)} (« ${lead.company} »).`,
    lead.positions ? `Poste indiqué : ${lead.positions}.` : null,
    lead.pain ? `Message : ${lead.pain}` : null,
    lead.notes ? `Notes du lead : ${lead.notes}` : null,
  ].filter(Boolean).join("\n");

  const { data, error } = await supabase
    .from("poei_candidates")
    .insert({
      org_id: orgId,
      source: "lead_resto",
      from_lead_id: lead.id,
      first_name: firstName,
      last_name: lastName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      target_job: lead.positions,
      notes,
      owner_user_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: translatePgError(error ?? { message: "Création impossible" }) };

  // Le lead sort du pipeline employeurs sans e-mail automatique (« hors cible » n'en déclenche pas).
  const { error: e2 } = await supabase
    .from("employer_leads")
    .update({ status: "hors_cible", lost_reason: "Candidat POEI, pas un employeur", next_action: null, next_action_on: null })
    .eq("id", lead.id)
    .eq("org_id", orgId);
  if (e2) return { ok: false, error: translatePgError(e2) };
  await supabase.from("employer_lead_events").insert({
    org_id: orgId, lead_id: lead.id, kind: "statut", outcome: null, by_user_id: userId,
    note: "Statut → hors_cible (c'est un candidat POEI, pas un employeur : fiche candidat créée)",
  });
  await journal(supabase, orgId, data.id, userId, "creation", `Requalifié depuis le lead resto ${leadRef(lead.lead_no)}`);
  revalidateCandidates(data.id);
  revalidatePath(`/leads/${lead.id}`);
  return { ok: true, id: data.id };
}

// ── Fiche (création directe + qualification) ─────────────────────────────────
const candidateSchema = z.object({
  id: uuid.optional(),
  source: z.enum(CANDIDATE_SOURCE_CODES).default("direct"),
  firstName: optText,
  lastName: z.string().trim().min(1, "Le nom est obligatoire"),
  phone: optText,
  email: optText,
  city: optText,
  ftStatus: z.enum(FT_STATUS_CODES).default("inconnu"),
  ftId: optText,
  income: optText,
  frenchLevel: optText,
  goal: optText,
  targetJob: optText,
  experience: optText,
  availability: optText,
  mobility: optText,
  workPermit: z.enum(WORK_PERMIT_CODES).default("inconnu"),
  constraints: optText,
  notes: optText,
});
export type CandidateInput = z.input<typeof candidateSchema>;

export async function upsertCandidate(raw: CandidateInput): Promise<CandidateResult> {
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();
  const row = {
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    email: d.email,
    city: d.city,
    ft_status: d.ftStatus,
    ft_id: d.ftId,
    income: d.income,
    french_level: d.frenchLevel,
    goal: d.goal,
    target_job: d.targetJob,
    experience: d.experience,
    availability: d.availability,
    mobility: d.mobility,
    work_permit: d.workPermit,
    constraints: d.constraints,
    notes: d.notes,
  };
  if (d.id) {
    const { error } = await supabase.from("poei_candidates").update(row).eq("id", d.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    revalidateCandidates(d.id);
    return { ok: true, id: d.id };
  }
  // Création directe : l'association passe par « Proposer en POEI » (lien avec l'apprenant).
  const source = d.source === "asso_pef" ? "direct" : d.source;
  const { data, error } = await supabase
    .from("poei_candidates")
    .insert({ ...row, org_id: orgId, source, owner_user_id: userId, created_by: userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: translatePgError(error ?? { message: "Création impossible" }) };
  await journal(supabase, orgId, data.id, userId, "creation", "Fiche créée");
  revalidateCandidates(data.id);
  return { ok: true, id: data.id };
}

export async function recordConsent(raw: { candidateId: string; channel: string; withdraw?: boolean }): Promise<ActionResult> {
  const parsed = z.object({ candidateId: uuid, channel: z.enum(CONSENT_CHANNEL_CODES), withdraw: z.boolean().optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();
  if (d.withdraw) {
    // Retrait : la fiche ne peut plus avancer ; on la classe sans suite.
    const { error } = await supabase
      .from("poei_candidates")
      .update({ consent_at: null, consent_channel: null, consent_by: null, status: "sans_suite", lost_reason: "Refuse la transmission de ses coordonnées", placed_lead_id: null, next_action: null, next_action_on: null })
      .eq("id", d.candidateId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    await journal(supabase, orgId, d.candidateId, userId, "consentement", "Consentement retiré — fiche classée sans suite");
  } else {
    const { error } = await supabase
      .from("poei_candidates")
      .update({ consent_at: new Date().toISOString(), consent_channel: d.channel, consent_by: userId })
      .eq("id", d.candidateId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    await journal(supabase, orgId, d.candidateId, userId, "consentement", `Consentement recueilli (${d.channel})`);
  }
  revalidateCandidates(d.candidateId);
  return { ok: true };
}

export async function setCandidateStatus(raw: { candidateId: string; status: string; lostReason?: string | null }): Promise<ActionResult> {
  const parsed = z.object({ candidateId: uuid, status: z.enum(CANDIDATE_STATUS_CODES), lostReason: z.string().nullable().optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();
  const { data: current } = await supabase.from("poei_candidates").select("consent_at").eq("id", d.candidateId).eq("org_id", orgId).maybeSingle();
  if (!current) return { ok: false, error: "Candidat introuvable." };
  const allowed = canMoveTo(d.status, current.consent_at);
  if (!allowed.ok) return allowed;
  const patch: Record<string, unknown> = { status: d.status, lost_reason: d.status === "sans_suite" ? d.lostReason?.trim() || null : null };
  if (isFinalCandidateStatus(d.status)) {
    patch.next_action = null;
    patch.next_action_on = null;
  }
  const { error } = await supabase.from("poei_candidates").update(patch).eq("id", d.candidateId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await journal(supabase, orgId, d.candidateId, userId, "statut", `Statut → ${candidateStatusLabel(d.status)}${d.lostReason && d.status === "sans_suite" ? ` (${d.lostReason})` : ""}`);
  revalidateCandidates(d.candidateId);
  return { ok: true };
}

// Positionner chez un restaurateur (lead resto) — exige le consentement.
export async function setPlacement(raw: { candidateId: string; leadId: string | null }): Promise<ActionResult> {
  const parsed = z.object({ candidateId: uuid, leadId: uuid.nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();
  const { data: current } = await supabase.from("poei_candidates").select("consent_at, status").eq("id", d.candidateId).eq("org_id", orgId).maybeSingle();
  if (!current) return { ok: false, error: "Candidat introuvable." };
  if (d.leadId) {
    const allowed = canMoveTo("positionne", current.consent_at);
    if (!allowed.ok) return allowed;
  }
  let leadLabel = "";
  if (d.leadId) {
    const { data: lead } = await supabase.from("employer_leads").select("lead_no, company").eq("id", d.leadId).eq("org_id", orgId).maybeSingle();
    if (!lead) return { ok: false, error: "Restaurateur introuvable." };
    leadLabel = `${lead.company} (${leadRef(lead.lead_no)})`;
  }
  const patch: Record<string, unknown> = { placed_lead_id: d.leadId };
  if (d.leadId && (current.status === "a_qualifier" || current.status === "a_rappeler" || current.status === "qualifie")) patch.status = "positionne";
  const { error } = await supabase.from("poei_candidates").update(patch).eq("id", d.candidateId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await journal(supabase, orgId, d.candidateId, userId, "statut", d.leadId ? `Positionné(e) chez ${leadLabel}` : "Positionnement retiré");
  revalidateCandidates(d.candidateId);
  if (d.leadId) revalidatePath(`/leads/${d.leadId}`);
  return { ok: true };
}

const eventSchema = z.object({
  candidateId: uuid,
  kind: z.enum(CANDIDATE_EVENT_KIND_CODES),
  outcome: z.enum(CANDIDATE_EVENT_OUTCOME_CODES).nullable(),
  note: z.string().nullable(),
  nextAction: z.string().nullable().optional(),
  nextActionOn: day.nullable().optional(),
});

export async function logCandidateEvent(raw: z.infer<typeof eventSchema>): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole([...CANDIDATE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("poei_candidate_events").insert({
    org_id: orgId, candidate_id: d.candidateId, kind: d.kind, outcome: d.outcome, note: d.note?.trim() || null, by_user_id: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };
  const patch: Record<string, unknown> = {};
  if (d.nextAction !== undefined) patch.next_action = d.nextAction?.trim() || null;
  if (d.nextActionOn !== undefined) patch.next_action_on = d.nextActionOn;
  // Injoignable / rappel convenu : la fiche passe « À rappeler » si elle était « À qualifier ».
  if (d.outcome === "messagerie" || d.outcome === "rappel_convenu") {
    const { data: c } = await supabase.from("poei_candidates").select("status").eq("id", d.candidateId).maybeSingle();
    if (c?.status === "a_qualifier") patch.status = "a_rappeler";
  }
  if (Object.keys(patch).length) {
    const { error: e2 } = await supabase.from("poei_candidates").update(patch).eq("id", d.candidateId).eq("org_id", orgId);
    if (e2) return { ok: false, error: translatePgError(e2) };
  }
  revalidateCandidates(d.candidateId);
  return { ok: true };
}

export async function deleteCandidate(raw: { candidateId: string }): Promise<ActionResult> {
  const parsed = z.object({ candidateId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("poei_candidates").delete().eq("id", parsed.data.candidateId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateCandidates();
  return { ok: true };
}

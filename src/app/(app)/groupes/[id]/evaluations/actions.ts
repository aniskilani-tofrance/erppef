"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { normalizeTarget } from "@/lib/evaluations/questions";

const mark = z.enum(["non_acquis", "en_cours", "acquis"]).nullable();
const kindSchema = z.enum(["mi_parcours", "finale"]);

const saveSchema = z.object({
  groupId: z.string().uuid(),
  learnerId: z.string().uuid(),
  kind: kindSchema,
  co: mark,
  po: mark,
  ce: mark,
  pe: mark,
  levelReached: z.string().max(40).nullable(),
  comment: z.string().max(2000).nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

// Grille d'une personne pour un jalon : créée ou mise à jour (une seule par apprenant et par jalon).
export async function saveEvaluation(raw: z.infer<typeof saveSchema>): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator", "trainer"]);
  const supabase = await createClient();
  const filled = Boolean(d.co || d.po || d.ce || d.pe || d.levelReached || d.comment?.trim());
  const { error } = await supabase.from("evaluations").upsert(
    {
      org_id: orgId,
      group_id: d.groupId,
      learner_id: d.learnerId,
      kind: d.kind,
      co: d.co,
      po: d.po,
      ce: d.ce,
      pe: d.pe,
      level_reached: d.levelReached?.trim() || null,
      comment: d.comment?.trim() || null,
      evaluated_by: filled ? userId : null,
      evaluated_at: filled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id,learner_id,kind" },
  );
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${d.groupId}/evaluations`);
  revalidatePath(`/groupes/${d.groupId}`);
  return { ok: true };
}

const launchSchema = z.object({ groupId: z.string().uuid(), kind: kindSchema, learnerIds: z.array(z.string().uuid()).max(200).optional() });

export type LaunchResult = { ok: true; created: number; skipped: number } | { ok: false; error: string };

// Crée un test ciblé (niveau visé du dispositif) pour chaque inscrit qui n'en a pas encore
// pour ce jalon. Les liens s'affichent ensuite dans la grille (WhatsApp / copier).
export async function launchEvaluationTests(raw: z.infer<typeof launchSchema>): Promise<LaunchResult> {
  const parsed = launchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { groupId, kind } = parsed.data;
  const { orgId } = await requireRole(["admin", "coordinator", "trainer"]);
  const supabase = await createClient();

  const [{ data: group }, { data: enrollments }, { data: existing }] = await Promise.all([
    supabase.from("groups").select("id, programs(level)").eq("id", groupId).eq("org_id", orgId).single(),
    supabase.from("enrollments").select("learner_id").eq("group_id", groupId).eq("status", "inscrit"),
    supabase.from("placement_tests").select("learner_id").eq("group_id", groupId).eq("purpose", kind),
  ]);
  if (!group) return { ok: false, error: "Groupe introuvable" };
  const target = normalizeTarget((group.programs as unknown as { level: string | null } | null)?.level);
  const already = new Set((existing ?? []).map((t) => t.learner_id));
  const wanted = (enrollments ?? [])
    .map((e) => e.learner_id)
    .filter((id) => !already.has(id))
    .filter((id) => !parsed.data.learnerIds || parsed.data.learnerIds.includes(id));
  if (wanted.length === 0) return { ok: true, created: 0, skipped: already.size };

  const { error } = await supabase.from("placement_tests").insert(
    wanted.map((learnerId) => ({ org_id: orgId, learner_id: learnerId, group_id: groupId, purpose: kind, target_level: target, status: "en_attente" })),
  );
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${groupId}/evaluations`);
  return { ok: true, created: wanted.length, skipped: already.size };
}

const milestonesSchema = z.object({
  groupId: z.string().uuid(),
  midtermOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  finalOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

// Dates des jalons (null = automatique d'après les séances).
export async function updateMilestones(raw: z.infer<typeof milestonesSchema>): Promise<ActionResult> {
  const parsed = milestonesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dates invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({ midterm_on: parsed.data.midtermOn, final_on: parsed.data.finalOn })
    .eq("id", parsed.data.groupId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${parsed.data.groupId}/evaluations`);
  revalidatePath(`/groupes/${parsed.data.groupId}`);
  revalidatePath("/evaluations");
  return { ok: true };
}

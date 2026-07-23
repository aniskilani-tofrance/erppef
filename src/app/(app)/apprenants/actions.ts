"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

const learnerSchema = z.object({
  id: z.string().uuid().optional(),
  photoUrl: z.string().url().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  firstLanguage: z.string().nullable(),
  levelAssessed: z.string().nullable(),
  franceTravailId: z.string().nullable(),
  notes: z.string().nullable(),
  // Flux « créer et inscrire » : à la création, inscrit directement dans ce groupe.
  enrollGroupId: z.string().uuid().nullable(),
});

export async function upsertLearner(raw: z.infer<typeof learnerSchema>): Promise<ActionResult> {
  const parsed = learnerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    photo_url: d.photoUrl,
    first_name: d.firstName,
    last_name: d.lastName,
    phone: d.phone,
    email: d.email,
    first_language: d.firstLanguage,
    level_assessed: d.levelAssessed,
    france_travail_id: d.franceTravailId,
    notes: d.notes,
  };

  if (d.id) {
    const { error } = await supabase.from("learners").update(row).eq("id", d.id);
    if (error) return { ok: false, error: translatePgError(error) };
  } else {
    const { data: created, error } = await supabase.from("learners").insert(row).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };

    if (d.enrollGroupId) {
      const { error: enrollError } = await supabase
        .from("enrollments")
        .insert({ org_id: orgId, group_id: d.enrollGroupId, learner_id: created.id });
      if (enrollError) {
        return { ok: false, error: `Apprenant créé, mais inscription impossible : ${translatePgError(enrollError)}` };
      }
    }
  }

  revalidatePath("/apprenants");
  if (d.enrollGroupId) revalidatePath(`/groupes/${d.enrollGroupId}`);
  return { ok: true };
}

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().nullable(),
        email: z.string().nullable(),
        firstLanguage: z.string().nullable(),
        levelAssessed: z.string().nullable(),
      }),
    )
    .min(1)
    .max(200),
  enrollGroupId: z.string().uuid().nullable(),
});

export type ImportResult = { ok: true; imported: number; enrolled: number } | { ok: false; error: string };

// Import en lot (rentrée de cohorte) : création des apprenants + inscription
// optionnelle dans un groupe, en une passe.
export async function importLearners(raw: z.infer<typeof importSchema>): Promise<ImportResult> {
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Lignes invalides (prénom et nom obligatoires)" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("learners")
    .insert(
      d.rows.map((r) => ({
        org_id: orgId,
        first_name: r.firstName,
        last_name: r.lastName,
        phone: r.phone,
        email: r.email,
        first_language: r.firstLanguage,
        level_assessed: r.levelAssessed,
      })),
    )
    .select("id");
  if (error) return { ok: false, error: translatePgError(error) };

  let enrolled = 0;
  if (d.enrollGroupId && created?.length) {
    const { error: enrollError } = await supabase.from("enrollments").insert(
      created.map((c) => ({ org_id: orgId, group_id: d.enrollGroupId!, learner_id: c.id })),
    );
    if (enrollError) {
      return { ok: false, error: `${created.length} apprenants créés, mais inscription impossible : ${translatePgError(enrollError)}` };
    }
    enrolled = created.length;
  }

  revalidatePath("/apprenants");
  if (d.enrollGroupId) revalidatePath(`/groupes/${d.enrollGroupId}`);
  return { ok: true, imported: created?.length ?? 0, enrolled };
}

const enrollSchema = z.object({
  groupId: z.string().uuid(),
  learnerId: z.string().uuid(),
});

export async function enrollLearner(raw: z.infer<typeof enrollSchema>): Promise<ActionResult> {
  const parsed = enrollSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase.from("enrollments").insert({
    org_id: orgId,
    group_id: parsed.data.groupId,
    learner_id: parsed.data.learnerId,
  });

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${parsed.data.groupId}`);
  revalidatePath("/apprenants");
  return { ok: true };
}

export async function unenrollLearner(enrollmentId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(enrollmentId).success) return { ok: false, error: "Identifiant invalide" };

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/groupes", "layout");
  revalidatePath("/apprenants");
  return { ok: true };
}

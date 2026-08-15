"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Crée un test de positionnement en attente pour l'apprenant (tolérant si la
// table n'est pas encore migrée : la création d'apprenant ne doit jamais échouer).
async function createTestFor(orgId: string, learnerIds: string[]): Promise<void> {
  if (!learnerIds.length) return;
  const supabase = await createClient();
  await supabase
    .from("placement_tests")
    .insert(learnerIds.map((id) => ({ org_id: orgId, learner_id: id })))
    .then(() => undefined, () => undefined);
}

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
  // Typologie (bilans financeurs) — tout optionnel, saisie progressive.
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  gender: z.enum(["femme", "homme", "autre"]).nullable(),
  nationality: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  qpv: z.boolean().nullable(),
  activityStatus: z
    .enum(["demandeur_emploi", "rsa", "salarie", "scolaire_etudiant", "inactif_autre"])
    .nullable(),
  rqth: z.boolean().nullable(),
  educationLevel: z.enum(["non_scolarise", "primaire", "secondaire", "superieur"]).nullable(),
  prescriber: z.string().nullable(),
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
    birth_date: d.birthDate,
    gender: d.gender,
    nationality: d.nationality,
    city: d.city,
    postal_code: d.postalCode,
    qpv: d.qpv,
    activity_status: d.activityStatus,
    rqth: d.rqth,
    education_level: d.educationLevel,
    prescriber: d.prescriber,
  };

  if (d.id) {
    const { error } = await supabase.from("learners").update(row).eq("id", d.id);
    if (error) return { ok: false, error: translatePgError(error) };
  } else {
    const { data: created, error } = await supabase.from("learners").insert(row).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };

    // Pas de niveau connu → test de positionnement généré automatiquement.
    if (!d.levelAssessed) await createTestFor(orgId, [created.id]);

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

  const withoutLevel = (created ?? [])
    .filter((_, i) => !d.rows[i].levelAssessed)
    .map((c) => c.id);
  await createTestFor(orgId, withoutLevel);

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

// (Re)génère un lien de test pour un apprenant (nouveau jeton, nouvelle tentative).
export async function createPlacementTest(learnerId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(learnerId).success) return { ok: false, error: "Apprenant invalide" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("placement_tests")
    .insert({ org_id: orgId, learner_id: learnerId })
    .select("token")
    .single();
  if (error) return { ok: false, error: translatePgError(error) };

  revalidatePath("/apprenants");
  return { ok: true, token: data.token };
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

const enrollmentStatusSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(["inscrit", "abandon", "termine"]),
  leftOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  leaveReason: z.string().nullable(),
});

// Sortie de parcours (abandon/terminé) : changement de statut DATÉ, jamais une
// suppression — les bilans financeurs comptent les sorties. Repasser en « inscrit »
// efface la date et le motif.
export async function updateEnrollmentStatus(
  raw: z.infer<typeof enrollmentStatusSchema>,
): Promise<ActionResult> {
  const parsed = enrollmentStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("enrollments")
    .update({
      status: d.status,
      left_on: d.status === "inscrit" ? null : (d.leftOn ?? new Date().toISOString().slice(0, 10)),
      leave_reason: d.status === "inscrit" ? null : d.leaveReason,
    })
    .eq("id", d.enrollmentId);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/groupes", "layout");
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translatePgError } from "@/lib/pg-errors";
import { inviteUser } from "@/lib/invitations";

const trainerSchema = z.object({
  id: z.string().uuid().optional(),
  firstName: z.string().min(1),
  lastName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  contractType: z.enum(["salarie", "vacataire"]),
  hourlyCost: z.number().positive(),
  weeklyHoursMax: z.number().positive(),
  priority: z.number().int().min(1),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  isActive: z.boolean(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };
export type TrainerUpsertResult =
  | { ok: true; invitation: "envoyee" | "compte_existant" | "sans_email" | "echec" }
  | { ok: false; error: string };

export async function upsertTrainer(raw: z.infer<typeof trainerSchema>): Promise<TrainerUpsertResult> {
  const parsed = trainerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    first_name: d.firstName,
    last_name: d.lastName,
    email: d.email,
    phone: d.phone,
    contract_type: d.contractType,
    hourly_cost: d.hourlyCost,
    weekly_hours_max: d.weeklyHoursMax,
    priority: d.priority,
    skills: d.skills,
    languages: d.languages,
    is_active: d.isActive,
  };

  let trainerId = d.id ?? null;
  if (d.id) {
    const { error } = await supabase.from("trainers").update(row).eq("id", d.id);
    if (error) return { ok: false, error: translatePgError(error) };
  } else {
    const { data: created, error } = await supabase.from("trainers").insert(row).select("id").single();
    if (error) return { ok: false, error: translatePgError(error) };
    trainerId = created.id;
  }

  // Nouveau formateur avec email → compte d'accès invité automatiquement (rôle formateur).
  let invitation: Extract<TrainerUpsertResult, { ok: true }>["invitation"] = "sans_email";
  if (!d.id && d.email && trainerId) {
    const invite = await inviteUser({
      orgId,
      email: d.email,
      fullName: `${d.firstName} ${d.lastName}`.trim(),
      role: "trainer",
      trainerId,
    });
    invitation = invite.ok ? (invite.alreadyHadAccount ? "compte_existant" : "envoyee") : "echec";
  }

  revalidatePath("/formateurs");
  return { ok: true, invitation };
}

// (Ré)invitation d'un formateur existant depuis sa fiche.
export async function inviteTrainerAccount(trainerId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(trainerId).success) return { ok: false, error: "Formateur invalide" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const admin = createAdminClient();

  const { data: trainer } = await admin
    .from("trainers")
    .select("id, first_name, last_name, email")
    .eq("id", trainerId)
    .eq("org_id", orgId)
    .single();
  if (!trainer) return { ok: false, error: "Formateur introuvable" };
  if (!trainer.email) return { ok: false, error: "Renseignez d'abord l'email sur la fiche du formateur." };

  const result = await inviteUser({
    orgId,
    email: trainer.email,
    fullName: `${trainer.first_name} ${trainer.last_name ?? ""}`.trim(),
    role: "trainer",
    trainerId: trainer.id,
  });
  if (!result.ok) return result;

  revalidatePath(`/formateurs/${trainerId}`);
  return { ok: true };
}

const availabilitySchema = z.object({
  trainerId: z.string().uuid(),
  slots: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
});

// Remplace l'ensemble des disponibilités récurrentes du formateur.
export async function setAvailabilities(raw: z.infer<typeof availabilitySchema>): Promise<ActionResult> {
  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("trainer_availabilities")
    .delete()
    .eq("trainer_id", d.trainerId);
  if (delError) return { ok: false, error: translatePgError(delError) };

  if (d.slots.length > 0) {
    const { error } = await supabase.from("trainer_availabilities").insert(
      d.slots.map((s) => ({
        org_id: orgId,
        trainer_id: d.trainerId,
        weekday: s.weekday,
        start_time: s.start,
        end_time: s.end,
      })),
    );
    if (error) return { ok: false, error: translatePgError(error) };
  }

  revalidatePath(`/formateurs/${d.trainerId}`);
  return { ok: true };
}

const absenceSchema = z.object({
  trainerId: z.string().uuid(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["conge", "maladie", "formation", "autre"]),
  note: z.string().nullable(),
});

export async function addAbsence(raw: z.infer<typeof absenceSchema>): Promise<ActionResult> {
  const parsed = absenceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator", "trainer"]);
  const supabase = await createClient();

  const { error } = await supabase.from("trainer_absences").insert({
    org_id: orgId,
    trainer_id: d.trainerId,
    starts_on: d.startsOn,
    ends_on: d.endsOn,
    kind: d.kind,
    note: d.note,
  });

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/formateurs/${d.trainerId}`);
  return { ok: true };
}

export async function deleteAbsence(id: string, trainerId: string): Promise<ActionResult> {
  await requireRole(["admin", "coordinator", "trainer"]);
  const supabase = await createClient();
  const { error } = await supabase.from("trainer_absences").delete().eq("id", id);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/formateurs/${trainerId}`);
  return { ok: true };
}

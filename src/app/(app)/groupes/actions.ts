"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { loadEngineData } from "@/lib/engine/loader";
import { proposeGroupPlan } from "@/lib/engine/propose";
import { generateSessions } from "@/lib/engine/recurrence";
import { nextDay, utcToLocalDate } from "@/lib/dates";
import type { Proposal } from "@/lib/engine/types";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

const slotSchema = z.object({
  weekday: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4),
    z.literal(5), z.literal(6), z.literal(7),
  ]),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const proposeSchema = z.object({
  programId: z.string().uuid(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalHours: z.number().positive().optional(), // défaut : volume du dispositif
  weeklyPattern: z.array(slotSchema).optional(),
  preferredTrainerId: z.string().uuid().optional(),
  preferredRoomId: z.string().uuid().optional(),
  expectedHeadcount: z.number().int().positive().optional(),
  skipSchoolHolidays: z.boolean().optional(),
});

export type ProposeResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; error: string };

// Calcule une proposition complète. N'ÉCRIT RIEN : l'écran de revue décide.
export async function proposePlan(raw: z.infer<typeof proposeSchema>): Promise<ProposeResult> {
  const parsed = proposeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const input = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);

  const supabase = await createClient();
  const { data: program, error } = await supabase
    .from("programs")
    .select("id, total_hours, default_weekly_hours, level, required_skills")
    .eq("id", input.programId)
    .single();
  if (error || !program) return { ok: false, error: "Dispositif introuvable" };

  const data = await loadEngineData(orgId, input.startsOn);
  const proposal = proposeGroupPlan(
    {
      programId: program.id,
      totalHours: input.totalHours ?? Number(program.total_hours),
      level: program.level,
      requiredSkills: program.required_skills ?? [],
      defaultWeeklyHours: program.default_weekly_hours
        ? Number(program.default_weekly_hours)
        : null,
      startsOn: input.startsOn,
      weeklyPattern: input.weeklyPattern,
      preferredTrainerId: input.preferredTrainerId,
      preferredRoomId: input.preferredRoomId,
      expectedHeadcount: input.expectedHeadcount,
      skipSchoolHolidays: input.skipSchoolHolidays,
    },
    data,
  );

  return { ok: true, proposal };
}

const commitSchema = z.object({
  name: z.string().min(1),
  programId: z.string().uuid(),
  funderId: z.string().uuid().nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacity: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  trainerId: z.string().uuid().nullable(),
  roomId: z.string().uuid().nullable(),
  weeklyPattern: z.array(slotSchema),
  totalHours: z.number().positive(),
  endsOn: z.string().nullable(),
  skipSchoolHolidays: z.boolean().default(true),
  sessions: z.array(
    z.object({ startsAt: z.string(), endsAt: z.string() }),
  ).min(1),
  enrollLearnerIds: z.array(z.string().uuid()).max(200).optional(),
});

export type CommitResult = { ok: true; groupId: string } | { ok: false; error: string };

export type SimpleResult = { ok: true } | { ok: false; error: string };

const groupUpdateSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().min(1),
  status: z.enum(["en_attente", "ouvert", "complet", "termine", "annule"]),
  funderId: z.string().uuid().nullable(),
  capacity: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  remindersEnabled: z.boolean(),
});

// Édition d'un groupe après création : nom, statut (clôture, annulation), financeur,
// capacité, notes. Les séances ne bougent pas (elles s'éditent dans le planning).
export async function updateGroup(raw: z.infer<typeof groupUpdateSchema>): Promise<SimpleResult> {
  const parsed = groupUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("groups")
    .update({
      name: d.name,
      status: d.status,
      funder_id: d.funderId,
      capacity: d.capacity,
      notes: d.notes,
      reminders_enabled: d.remindersEnabled,
    })
    .eq("id", d.groupId);
  if (error) return { ok: false, error: translatePgError(error) };

  revalidatePath(`/groupes/${d.groupId}`);
  revalidatePath("/groupes");
  return { ok: true };
}

// Replanifie les heures manquantes d'un groupe (séances annulées, volume incomplet) :
// reprend le motif hebdo du groupe et ajoute des séances À LA SUITE de la dernière
// séance existante, en sautant les fermetures applicables.
export async function replanMissingHours(groupId: string): Promise<SimpleResult> {
  if (!z.string().uuid().safeParse(groupId).success) return { ok: false, error: "Groupe invalide" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: group }, { data: hours }, { data: lastSession }] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase.from("v_group_hours").select("*").eq("group_id", groupId).single(),
    supabase
      .from("sessions")
      .select("starts_at")
      .eq("group_id", groupId)
      .neq("status", "annulee")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!group) return { ok: false, error: "Groupe introuvable" };

  const missing = Number(group.total_hours) - Number(hours?.hours_scheduled ?? 0);
  if (missing <= 0.01) return { ok: false, error: "Rien à replanifier : le volume d'heures est complet." };

  const pattern = (group.weekly_pattern ?? []) as { weekday: number; start: string; end: string }[];
  if (!pattern.length) return { ok: false, error: "Ce groupe n'a pas de motif hebdomadaire enregistré." };

  // Reprise le lendemain de la dernière séance planifiée (ou à la date de début du groupe)
  const startsOn = lastSession
    ? nextDay(utcToLocalDate(lastSession.starts_at))
    : group.starts_on;

  const data = await loadEngineData(orgId, startsOn);
  const closures =
    group.skip_school_holidays === false
      ? data.closures.filter((c) => c.kind !== "vacances_scolaires")
      : data.closures;

  const recurrence = generateSessions({
    pattern: pattern as Parameters<typeof generateSessions>[0]["pattern"],
    startsOn,
    totalHours: missing,
    closures,
    tz: data.timezone,
  });
  if (!recurrence.sessions.length) return { ok: false, error: "Aucune séance générée : vérifiez le motif hebdo." };

  const { error } = await supabase.from("sessions").insert(
    recurrence.sessions.map((s) => ({
      org_id: orgId,
      group_id: groupId,
      trainer_id: group.trainer_id,
      room_id: group.room_id,
      starts_at: s.startsAt,
      ends_at: s.endsAt,
      generated: true,
    })),
  );
  if (error) {
    return {
      ok: false,
      error: `Conflit lors de la replanification (${translatePgError(error)}). Ajustez le planning à la main ou changez de salle/formateur.`,
    };
  }

  const lastDate = recurrence.sessions[recurrence.sessions.length - 1].localDate;
  await supabase.from("groups").update({ ends_on: lastDate }).eq("id", groupId);

  revalidatePath(`/groupes/${groupId}`);
  revalidatePath("/planning");
  return { ok: true };
}

// Ouvre (ou régénère) l'enquête de satisfaction anonyme du groupe.
export async function openSurvey(groupId: string): Promise<SimpleResult> {
  if (!z.string().uuid().safeParse(groupId).success) return { ok: false, error: "Groupe invalide" };
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({ survey_token: crypto.randomUUID() })
    .eq("id", groupId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${groupId}`);
  return { ok: true };
}

// Clôture l'enquête : le lien public cesse de fonctionner, les réponses restent.
export async function closeSurvey(groupId: string): Promise<SimpleResult> {
  if (!z.string().uuid().safeParse(groupId).success) return { ok: false, error: "Groupe invalide" };
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("groups").update({ survey_token: null }).eq("id", groupId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath(`/groupes/${groupId}`);
  return { ok: true };
}

// Commit transactionnel via la RPC : si une contrainte d'exclusion saute
// (conflit apparu depuis la proposition), tout est rollback et l'erreur est traduite.
export async function commitProposal(raw: z.infer<typeof commitSchema>): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données de groupe invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);

  const supabase = await createClient();
  const { data: groupId, error } = await supabase.rpc("create_group_with_sessions", {
    payload: {
      group: {
        org_id: orgId,
        program_id: d.programId,
        funder_id: d.funderId,
        name: d.name,
        starts_on: d.startsOn,
        ends_on: d.endsOn,
        total_hours: d.totalHours,
        trainer_id: d.trainerId,
        room_id: d.roomId,
        capacity: d.capacity,
        status: "ouvert",
        weekly_pattern: d.weeklyPattern,
        notes: d.notes,
        skip_school_holidays: d.skipSchoolHolidays,
      },
      sessions: d.sessions.map((s) => ({
        trainer_id: d.trainerId,
        room_id: d.roomId,
        starts_at: s.startsAt,
        ends_at: s.endsAt,
      })),
    },
  });

  if (error) return { ok: false, error: translatePgError(error) };

  // Groupe de niveau : inscription immédiate des apprenants sélectionnés
  if (d.enrollLearnerIds?.length) {
    const { error: enrollError } = await supabase.from("enrollments").insert(
      d.enrollLearnerIds.map((learnerId) => ({
        org_id: orgId,
        group_id: groupId as string,
        learner_id: learnerId,
      })),
    );
    if (enrollError) {
      revalidatePath("/groupes");
      return {
        ok: false,
        error: `Groupe créé, mais inscriptions impossibles : ${translatePgError(enrollError)} — inscrivez-les depuis la fiche du groupe.`,
      };
    }
    revalidatePath("/apprenants");
  }

  revalidatePath("/groupes");
  revalidatePath("/planning");
  revalidatePath("/dashboard");
  return { ok: true, groupId: groupId as string };
}

const duplicateSchema = z.object({
  groupId: z.string().uuid(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DuplicateResult = { ok: true; groupId: string } | { ok: false; error: string };

// « Reconduire le groupe » (trimestre suivant, nouvelle session…) : nouveau groupe
// identique (dispositif, financeur, formateur, salle, rythme) dont le planning est
// re-matérialisé depuis la nouvelle date — les nouvelles vacances et fériés sont sautés.
// Les conflits éventuels sont tranchés par Postgres au commit (rollback complet).
export async function duplicateGroup(raw: z.infer<typeof duplicateSchema>): Promise<DuplicateResult> {
  const parsed = duplicateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const { groupId, startsOn } = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("*, programs(default_weekly_hours)")
    .eq("id", groupId)
    .single();
  if (!group) return { ok: false, error: "Groupe introuvable" };

  const pattern = (group.weekly_pattern ?? []) as { weekday: number; start: string; end: string }[];
  if (!pattern.length) return { ok: false, error: "Ce groupe n'a pas de motif hebdomadaire enregistré." };

  const data = await loadEngineData(orgId, startsOn);
  const closures =
    group.skip_school_holidays === false
      ? data.closures.filter((c) => c.kind !== "vacances_scolaires")
      : data.closures;

  const recurrence = generateSessions({
    pattern: pattern as Parameters<typeof generateSessions>[0]["pattern"],
    startsOn,
    totalHours: Number(group.total_hours),
    closures,
    tz: data.timezone,
  });
  if (recurrence.sessions.length === 0) {
    return { ok: false, error: "Aucune séance générée : vérifiez la date de début." };
  }

  const lastDay = recurrence.sessions[recurrence.sessions.length - 1].localDate;
  const { data: newGroupId, error } = await supabase.rpc("create_group_with_sessions", {
    payload: {
      group: {
        org_id: orgId,
        program_id: group.program_id,
        funder_id: group.funder_id,
        name: `${group.name} (suite)`,
        starts_on: startsOn,
        ends_on: lastDay,
        total_hours: Number(group.total_hours),
        trainer_id: group.trainer_id,
        room_id: group.room_id,
        capacity: group.capacity,
        status: "en_attente",
        weekly_pattern: pattern,
        notes: group.notes,
        skip_school_holidays: group.skip_school_holidays,
      },
      sessions: recurrence.sessions.map((s) => ({
        trainer_id: group.trainer_id,
        room_id: group.room_id,
        starts_at: s.startsAt,
        ends_at: s.endsAt,
      })),
    },
  });
  if (error) return { ok: false, error: translatePgError(error) };

  revalidatePath("/groupes");
  revalidatePath("/planning");
  return { ok: true, groupId: newGroupId as string };
}

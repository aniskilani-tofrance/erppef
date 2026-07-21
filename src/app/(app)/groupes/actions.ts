"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { loadEngineData } from "@/lib/engine/loader";
import { proposeGroupPlan } from "@/lib/engine/propose";
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
  sessions: z.array(
    z.object({ startsAt: z.string(), endsAt: z.string() }),
  ).min(1),
});

export type CommitResult = { ok: true; groupId: string } | { ok: false; error: string };

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

  revalidatePath("/groupes");
  revalidatePath("/planning");
  revalidatePath("/dashboard");
  return { ok: true, groupId: groupId as string };
}

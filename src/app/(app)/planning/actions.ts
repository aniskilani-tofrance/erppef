"use server";

import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

export type CalendarSession = {
  id: string;
  groupId: string;
  groupName: string;
  trainerId: string | null;
  trainerName: string | null;
  roomId: string | null;
  roomName: string | null;
  funderColor: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

// Lecture des séances de la plage visible (appelée via React Query).
export async function fetchSessions(range: { from: string; to: string }): Promise<CalendarSession[]> {
  await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, group_id, trainer_id, room_id, starts_at, ends_at, status, groups(name, funders(color)), trainers:trainer_id(first_name, last_name), rooms:room_id(name)",
    )
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .neq("status", "annulee");

  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => {
    const group = s.groups as unknown as { name: string; funders: { color: string } | null } | null;
    const trainer = s.trainers as unknown as { first_name: string; last_name: string } | null;
    const room = s.rooms as unknown as { name: string } | null;
    return {
      id: s.id,
      groupId: s.group_id,
      groupName: group?.name ?? "Groupe",
      trainerId: s.trainer_id,
      trainerName: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
      roomId: s.room_id,
      roomName: room?.name ?? null,
      funderColor: group?.funders?.color ?? "#64748b",
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status: s.status,
    };
  });
}

const moveSchema = z.object({
  sessionId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type MoveResult = { ok: true } | { ok: false; error: string };

// Déplacement / redimensionnement : on tente l'UPDATE, Postgres tranche les conflits (23P01).
export async function moveSession(raw: z.infer<typeof moveSchema>): Promise<MoveResult> {
  const parsed = moveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt })
    .eq("id", parsed.data.sessionId);

  if (error) return { ok: false, error: translatePgError(error) };
  return { ok: true };
}

const updateSchema = z.object({
  sessionId: z.string().uuid(),
  trainerId: z.string().uuid().nullable(),
  roomId: z.string().uuid().nullable(),
  status: z.enum(["planifiee", "realisee", "annulee"]),
});

// Édition depuis le Sheet : remplacement de formateur, changement de salle, annulation.
export async function updateSession(raw: z.infer<typeof updateSchema>): Promise<MoveResult> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({
      trainer_id: parsed.data.trainerId,
      room_id: parsed.data.roomId,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.sessionId);

  if (error) return { ok: false, error: translatePgError(error) };
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  equipment: z.array(z.string()),
  isActive: z.boolean(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

const hoursSchema = z.object({
  roomId: z.string().uuid(),
  slots: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
});

// Remplace les horaires d'ouverture de la salle. Liste vide = ouverte sur les
// horaires de l'organisme (comportement par défaut).
export async function setRoomAvailabilities(raw: z.infer<typeof hoursSchema>): Promise<ActionResult> {
  const parsed = hoursSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  if (d.slots.some((s) => s.end <= s.start)) return { ok: false, error: "Un créneau se termine avant de commencer." };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("room_availabilities")
    .delete()
    .eq("room_id", d.roomId);
  if (delError) return { ok: false, error: translatePgError(delError) };

  if (d.slots.length > 0) {
    const { error } = await supabase.from("room_availabilities").insert(
      d.slots.map((s) => ({
        org_id: orgId,
        room_id: d.roomId,
        weekday: s.weekday,
        start_time: s.start,
        end_time: s.end,
      })),
    );
    if (error) return { ok: false, error: translatePgError(error) };
  }

  revalidatePath("/salles");
  return { ok: true };
}

export async function upsertRoom(raw: z.infer<typeof roomSchema>): Promise<ActionResult> {
  const parsed = roomSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    name: d.name,
    capacity: d.capacity,
    equipment: d.equipment,
    is_active: d.isActive,
  };

  const { error } = d.id
    ? await supabase.from("rooms").update(row).eq("id", d.id)
    : await supabase.from("rooms").insert(row);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/salles");
  return { ok: true };
}

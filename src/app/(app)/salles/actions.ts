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

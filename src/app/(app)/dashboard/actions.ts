"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

const followupSchema = z.object({
  learnerId: z.string().uuid(),
  channel: z.enum(["whatsapp", "telephone"]),
  note: z.string().max(300),
});

// Relance d'un absent : tracée dans le carnet de contact de l'apprenant (même journal que
// l'admission), ce qui le retire de la liste « Absents à relancer ». Le statut
// d'admission n'est jamais touché : la personne est déjà inscrite.
export async function logAbsenceFollowup(raw: z.infer<typeof followupSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = followupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: d.learnerId,
    channel: d.channel,
    outcome: d.channel === "whatsapp" ? "message_envoye" : "joint",
    note: d.note,
    created_by: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/dashboard");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

const complaintSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(["apprenant", "financeur", "formateur", "partenaire", "autre"]),
  authorName: z.string().nullable(),
  subject: z.string().min(1),
  details: z.string().nullable(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ouverte", "en_cours", "traitee"]),
  resolution: z.string().nullable(),
});

// Registre des réclamations (Qualiopi ind. 31) : chaque réclamation est tracée
// avec son traitement et sa date de résolution.
export async function upsertComplaint(raw: z.infer<typeof complaintSchema>): Promise<ActionResult> {
  const parsed = complaintSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    source: d.source,
    author_name: d.authorName,
    subject: d.subject,
    details: d.details,
    received_on: d.receivedOn,
    status: d.status,
    resolution: d.resolution,
    resolved_on: d.status === "traitee" ? new Date().toISOString().slice(0, 10) : null,
  };

  const { error } = d.id
    ? await supabase.from("complaints").update(row).eq("id", d.id)
    : await supabase.from("complaints").insert(row);

  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/qualite");
  return { ok: true };
}

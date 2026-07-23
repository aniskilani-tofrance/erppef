"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Enquête de satisfaction PUBLIQUE et ANONYME (Qualiopi ind. 30) : le token du
// groupe est le secret ; les réponses sont insérées côté serveur uniquement.

export type SurveyInfo = { groupId: string; groupName: string; programName: string | null };

const uuid = z.string().uuid();

async function findOpenSurvey(token: string) {
  if (!uuid.safeParse(token).success) return null;
  const supabase = createAdminClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, org_id, name, programs(name)")
    .eq("survey_token", token)
    .single();
  return group ?? null;
}

export async function fetchSurvey(token: string): Promise<SurveyInfo | null> {
  const group = await findOpenSurvey(token);
  if (!group) return null;
  return {
    groupId: group.id,
    groupName: group.name,
    programName: (group.programs as unknown as { name: string } | null)?.name ?? null,
  };
}

const note = z.number().int().min(1).max(5);
const submitSchema = z.object({
  token: z.string().uuid(),
  overall: note,
  teaching: note.nullable(),
  organization: note.nullable(),
  premises: note.nullable(),
  progress: note.nullable(),
  comment: z.string().max(2000).nullable(),
});

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitSurvey(raw: z.infer<typeof submitSchema>): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Réponses invalides." };
  const d = parsed.data;

  const group = await findOpenSurvey(d.token);
  if (!group) return { ok: false, error: "Enquête clôturée ou lien invalide." };

  const { error } = await createAdminClient().from("survey_responses").insert({
    org_id: group.org_id,
    group_id: group.id,
    overall: d.overall,
    teaching: d.teaching,
    organization: d.organization,
    premises: d.premises,
    progress: d.progress,
    comment: d.comment?.trim() || null,
  });
  if (error) return { ok: false, error: "Enregistrement impossible, réessayez." };
  return { ok: true };
}

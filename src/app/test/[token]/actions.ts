"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeTest, publicQuestions } from "@/lib/placement/grading";

// Test de positionnement PUBLIC : le token est le secret (pattern émargement).
// Les questions partent au client SANS les réponses ; la correction est serveur.

export type TestInfo = {
  learnerFirstName: string;
  status: "en_attente" | "fait";
  level: string | null;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  questions: any[];
};

const uuid = z.string().uuid();

async function findTest(token: string) {
  if (!uuid.safeParse(token).success) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("placement_tests")
    .select("id, org_id, learner_id, status, level, learners(first_name)")
    .eq("token", token)
    .single();
  return data ?? null;
}

export async function fetchTest(token: string): Promise<TestInfo | null> {
  const test = await findTest(token);
  if (!test) return null;
  return {
    learnerFirstName: (test.learners as unknown as { first_name: string } | null)?.first_name ?? "",
    status: test.status as TestInfo["status"],
    level: test.level,
    questions: test.status === "en_attente" ? publicQuestions() : [],
  };
}

const submitSchema = z.object({
  token: z.string().uuid(),
  durationSeconds: z.number().int().min(0).max(4 * 3600),
  answers: z.record(z.string(), z.string().max(5000)),
});

export type SubmitTestResult =
  | { ok: true; score: number; level: string }
  | { ok: false; error: string };

export async function submitTest(raw: z.infer<typeof submitSchema>): Promise<SubmitTestResult> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Réponses invalides." };
  const d = parsed.data;

  const test = await findTest(d.token);
  if (!test) return { ok: false, error: "Lien de test invalide." };
  if (test.status === "fait") return { ok: false, error: "Ce test a déjà été passé." };

  const byId: Record<number, string> = {};
  for (const [k, v] of Object.entries(d.answers)) byId[Number(k)] = v;

  const result = await gradeTest(byId);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("placement_tests")
    .update({
      status: "fait",
      score: result.score,
      level: result.level,
      answers: result.answers,
      duration_seconds: d.durationSeconds,
      completed_at: new Date().toISOString(),
    })
    .eq("id", test.id)
    .eq("status", "en_attente");
  if (error) return { ok: false, error: "Enregistrement impossible, réessayez." };

  // Le niveau attribué remplit la fiche apprenant (modifiable ensuite par l'équipe).
  await supabase
    .from("learners")
    .update({ level_assessed: result.level })
    .eq("id", test.learner_id);

  return { ok: true, score: result.score, level: result.level };
}

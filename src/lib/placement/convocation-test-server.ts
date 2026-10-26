import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickConvocationTests,
  testLink,
  type ConvocationTestRow,
  type ConvocationTests,
} from "@/lib/placement/convocation-test";

// Lecture et création des tests de niveau pour une convocation. Fonctionne avec le client de la
// personne connectée (RLS : coordination) comme avec le client service_role (page publique, cron).
// Seuls les tests de POSITIONNEMENT comptent : un test de mi-parcours ou de fin n'est pas « le test ».

async function load(db: SupabaseClient, orgId: string, learnerIds: string[]): Promise<ConvocationTests> {
  if (!learnerIds.length) return { pending: new Map(), missing: [], done: new Set() };
  const [{ data: learners }, { data: tests }] = await Promise.all([
    db.from("learners").select("id, level_assessed").eq("org_id", orgId).in("id", learnerIds),
    db
      .from("placement_tests")
      .select("learner_id, status, token, created_at")
      .eq("org_id", orgId)
      .eq("purpose", "positionnement")
      .in("learner_id", learnerIds),
  ]);
  return pickConvocationTests(
    (learners ?? []) as { id: string; level_assessed: string | null }[],
    (tests ?? []) as ConvocationTestRow[],
  );
}

/** Lecture seule : learnerId → lien du test en attente, pour ceux qui doivent encore le faire. */
export async function loadConvocationTests(
  db: SupabaseClient,
  orgId: string,
  learnerIds: string[],
): Promise<{ urls: Map<string, string>; missing: string[]; done: Set<string> }> {
  const { pending, missing, done } = await load(db, orgId, learnerIds);
  return { urls: new Map([...pending].map(([id, token]) => [id, testLink(token)])), missing, done };
}

/**
 * Crée le lien manquant de chaque personne qui doit encore faire le test (un test PAR apprenant :
 * c'est ce qui le rattache à la bonne fiche), puis renvoie tous les liens. Idempotent : une personne
 * qui a déjà un test en attente le garde, une personne qui l'a fait n'en reçoit pas.
 */
export async function ensureConvocationTests(
  db: SupabaseClient,
  orgId: string,
  learnerIds: string[],
): Promise<{ urls: Map<string, string>; created: number }> {
  const first = await load(db, orgId, learnerIds);
  const urls = new Map([...first.pending].map(([id, token]) => [id, testLink(token)]));
  if (!first.missing.length) return { urls, created: 0 };

  const { data: rows, error } = await db
    .from("placement_tests")
    .insert(first.missing.map((learner_id) => ({ org_id: orgId, learner_id })))
    .select("learner_id, token");
  if (error) {
    // Jamais bloquant : la convocation part sans lien, l'équipe peut préparer les tests ensuite.
    console.warn(`[convocation] tests de niveau non créés : ${error.message}`);
    return { urls, created: 0 };
  }
  for (const r of (rows ?? []) as { learner_id: string; token: string }[]) urls.set(r.learner_id, testLink(r.token));
  return { urls, created: rows?.length ?? 0 };
}

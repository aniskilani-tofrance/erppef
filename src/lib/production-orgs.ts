import type { SupabaseClient } from "@supabase/supabase-js";

// L'organisation « Bac à sable (démo) » partage la base avec la production (mêmes
// tables, mêmes numéros d'apprenants). Tout traitement automatique qui lit la base
// entière (crons, alertes, rappels) doit se limiter aux organisations réelles.
export const SANDBOX_SLUG = "bac-a-sable";

export async function productionOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("organizations").select("id").neq("slug", SANDBOX_SLUG);
  if (error) throw new Error(`organisations : ${error.message}`);
  return (data ?? []).map((o) => o.id as string);
}

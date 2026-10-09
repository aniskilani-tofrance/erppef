import type { SupabaseClient } from "@supabase/supabase-js";
import { groupColor, type GroupRef } from "@/lib/admission/group-colors";

// Groupes en cours (légende des pastilles « groupe »), couleur de la formatrice. Serveur.
export async function loadActiveGroupRefs(supabase: SupabaseClient): Promise<GroupRef[]> {
  const { data } = await supabase
    .from("groups")
    .select("id, name, trainers:trainer_id(color)")
    .in("status", ["en_attente", "ouvert", "complet"])
    .order("name");
  return (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    color: groupColor({ id: g.id, trainerColor: (g.trainers as unknown as { color: string | null } | null)?.color ?? null }),
  }));
}

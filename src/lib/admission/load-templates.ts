import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTemplates, type Templates } from "@/lib/admission/templates";

// Modèles de messages de l'organisme (défauts + retouches enregistrées dans
// organizations.settings.whatsapp_templates). Serveur uniquement.
export async function loadTemplates(supabase: SupabaseClient, orgId?: string): Promise<Templates> {
  const q = supabase.from("organizations").select("settings");
  const { data } = orgId ? await q.eq("id", orgId).single() : await q.single();
  return resolveTemplates(data?.settings ?? null);
}

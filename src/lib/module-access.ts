import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { cleanDeniedModules, type ModuleKey } from "@/lib/modules";

// Modules retirés à la personne connectée, dans son organisation (lu une fois par requête).
// Sert à l'affichage (menu, nouveautés, aide). La barrière elle-même est ailleurs : le
// filtre des requêtes (proxy) pour les pages et les actions, et la base (migration 0062).
// En cas d'erreur de lecture, on n'invente pas de refus : la base, elle, refuse toujours.
export const loadDeniedModules = cache(async (userId: string, orgId: string): Promise<ModuleKey[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").select("denied_modules").eq("user_id", userId).eq("org_id", orgId).maybeSingle();
  if (error || !data) return [];
  return cleanDeniedModules(data.denied_modules);
});

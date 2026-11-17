import { redirect } from "next/navigation";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FINANCEMENTS_ROLES, type Portal } from "./constants";

// Pages du module : réservées à l'administration et à la coordination. Un autre rôle
// (formateur, lecture seule, setter, stagiaire) est renvoyé vers le tableau de bord ;
// la base le refuse de toute façon (RLS de la migration 0049).
export async function requireFinancements(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!(FINANCEMENTS_ROLES as readonly string[]).includes(ctx.role)) redirect("/dashboard");
  return ctx;
}

export type TeamMember = { userId: string; name: string };
export type FunderLite = { id: string; name: string; code: string; portal: Portal | null };

// Responsables possibles d'un dossier : les admins et coordinateurs de l'organisation.
export async function loadTeam(orgId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId)
    .in("role", ["admin", "coordinator"]);
  return (data ?? [])
    .map((m) => ({
      userId: m.user_id as string,
      name: ((m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "").trim() || "Sans nom",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function loadFundersLite(orgId: string): Promise<FunderLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("funders").select("id, name, code, portal").eq("org_id", orgId).order("name");
  return (data ?? []).map((f) => ({ id: f.id, name: f.name, code: f.code, portal: (f.portal ?? null) as Portal | null }));
}

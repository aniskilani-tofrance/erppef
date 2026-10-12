import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSession, type AppRole, type SessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Rôle « stagiaire » : une personne en stage dans l'organisme, rattachée par la
// coordination à un ou plusieurs groupes (table group_interns). Elle n'a accès qu'à ces
// groupes : fiche, apprenants inscrits, planning, émargement, kits de séance et documents
// administratifs du groupe. La RLS applique la même règle côté base (migration 0045) ;
// ces helpers la répètent côté serveur pour les routes qui passent par le client
// service_role (émargement, PDF), où la RLS ne s'applique pas.

/** Groupes auxquels l'utilisateur est rattaché comme stagiaire. */
export async function internGroupIds(supabase: SupabaseClient, userId: string, orgId?: string): Promise<string[]> {
  let query = supabase.from("group_interns").select("group_id").eq("user_id", userId);
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query;
  return (data ?? []).map((r) => r.group_id as string);
}

/** Règle pure : ce rôle a-t-il accès à ce groupe ? (le stagiaire seulement à ses groupes) */
export function canAccessGroup(role: AppRole, groupId: string, myGroupIds: string[], allowed: AppRole[]): boolean {
  if (role === "stagiaire") return allowed.includes("stagiaire") && myGroupIds.includes(groupId);
  return allowed.includes(role);
}

/**
 * Garde d'une page ou d'une route liée à un groupe : session + rôle autorisé, et pour un
 * stagiaire, rattachement au groupe. Sinon 404 (on ne confirme pas l'existence du groupe).
 */
export async function requireGroupAccess(groupId: string, allowed: AppRole[]): Promise<SessionContext> {
  const ctx = await requireSession();
  const myGroupIds = ctx.role === "stagiaire" ? await internGroupIds(await createClient(), ctx.userId) : [];
  if (!canAccessGroup(ctx.role, groupId, myGroupIds, allowed)) {
    if (!allowed.includes(ctx.role)) throw new Error("Accès refusé : votre rôle ne permet pas cette action.");
    notFound();
  }
  return ctx;
}

/** Même garde pour une séance : on remonte à son groupe (client service_role, org vérifiée). */
export async function assertSessionAccess(
  admin: SupabaseClient,
  ctx: SessionContext,
  sessionId: string,
): Promise<boolean> {
  if (ctx.role !== "stagiaire") return true;
  const { data: session } = await admin.from("sessions").select("group_id").eq("id", sessionId).eq("org_id", ctx.orgId).maybeSingle();
  if (!session) return false;
  const myGroupIds = await internGroupIds(admin, ctx.userId, ctx.orgId);
  return myGroupIds.includes(session.group_id as string);
}

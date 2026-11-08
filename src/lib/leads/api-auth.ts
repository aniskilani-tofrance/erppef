import { createAdminClient } from "@/lib/supabase/admin";
import { SANDBOX_SLUG } from "@/lib/production-orgs";
import { bearerOf, tokenMatches } from "@/lib/veille/auth";

// Authentification de l'API Leads (agents Claude du QG, scripts d'import).
// Un jeton de service unique, PEF_LEADS_API_TOKEN, présenté en « Authorization: Bearer … ».
// Il n'est ni journalisé, ni renvoyé, ni stocké en base ; comparaison à temps constant
// (empreintes SHA-256, comme l'API de veille).
//
// L'organisation n'est JAMAIS choisie par l'appelant : c'est toujours la production
// « ParlerEmploi Formation » (ORG_PEF). Le bac à sable partage la base ; s'il se trouvait un
// jour derrière cet identifiant, l'API refuse de travailler (503) plutôt que d'y écrire.

export const ORG_PEF = "a0000000-0000-4000-8000-000000000001";

export type LeadsApiOrg = { id: string; name: string };
export type LeadsApiAuth = { ok: true; org: LeadsApiOrg } | { ok: false; status: 401 | 503; erreur: string };

export async function authenticateLeadsApi(req: Request): Promise<LeadsApiAuth> {
  const expected = process.env.PEF_LEADS_API_TOKEN;
  if (!expected || expected.length < 16) return { ok: false, status: 503, erreur: "API Leads non configurée côté serveur (jeton absent)" };
  if (!tokenMatches(bearerOf(req), expected)) return { ok: false, status: 401, erreur: "Jeton manquant ou invalide" };
  const org = await productionOrg();
  if (!org) return { ok: false, status: 503, erreur: "Organisation de production introuvable" };
  return { ok: true, org };
}

/** L'organisation de production, ou null si elle n'existe pas ou ressemble au bac à sable. */
export async function productionOrg(): Promise<LeadsApiOrg | null> {
  const { data } = await createAdminClient().from("organizations").select("id, name, slug").eq("id", ORG_PEF).maybeSingle();
  if (!data || data.slug === SANDBOX_SLUG) return null;
  return { id: data.id as string, name: data.name as string };
}

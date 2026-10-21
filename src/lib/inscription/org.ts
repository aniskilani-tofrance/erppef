import { createAdminClient } from "@/lib/supabase/admin";
import { SANDBOX_SLUG } from "@/lib/production-orgs";

// Organisation d'un lien d'inscription rapide : `?o=<slug>` ou ParlerEmploi par défaut
// (SIGNUP_ORG_SLUG, sinon « pef » comme les autres traitements sans session). Jamais le
// bac à sable : une inscription réelle n'y atterrit pas. Serveur uniquement.
const DEFAULT_ORG_SLUG = process.env.SIGNUP_ORG_SLUG ?? "pef";

export function signupOrgSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase() || DEFAULT_ORG_SLUG;
  if (!/^[a-z0-9-]{1,60}$/.test(s) || s === SANDBOX_SLUG) return null;
  return s;
}

export async function resolveSignupOrg(raw: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const slug = signupOrgSlug(raw);
  if (!slug) return null;
  const { data } = await createAdminClient().from("organizations").select("id, name").eq("slug", slug).maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

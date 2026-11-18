import { createAdminClient } from "@/lib/supabase/admin";
import { productionOrgIds } from "@/lib/production-orgs";
import { runFundingWatch } from "@/lib/financements/veille-run";

// La recherche web par le modèle prend une à trois minutes.
export const maxDuration = 300;

// Cron Vercel quotidien (cf. vercel.json) : veille automatique des financements de chaque
// organisation réelle (jamais le bac à sable). Authentifié par le header
// Authorization: Bearer <CRON_SECRET> que Vercel ajoute aux invocations de cron.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const orgIds = await productionOrgIds(admin);
  const results: Record<string, unknown>[] = [];
  for (const orgId of orgIds) {
    const outcome = await runFundingWatch(admin, orgId).catch((e) => ({ ok: false as const, skipped: e instanceof Error ? e.message : "erreur" }));
    results.push(outcome.ok ? { orgId, axe: outcome.run.focus, ajoutees: outcome.run.added, trouvees: outcome.run.found, erreur: outcome.run.error } : { orgId, ignoree: outcome.skipped });
  }
  return Response.json({ organisations: results.length, resultats: results });
}

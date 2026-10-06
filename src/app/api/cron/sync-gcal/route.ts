import { SANDBOX_SLUG } from "@/lib/production-orgs";
import { createAdminClient } from "@/lib/supabase/admin";
import { gcalConfigured, syncTrainerCalendars } from "@/lib/gcal";

export const maxDuration = 300; // première passe ou rentrée : plusieurs centaines d'écritures Google, avec réessais

// Cron Vercel (cf. vercel.json) : synchronise chaque nuit les agendas Google
// des formateurs. Authentifié par le header Authorization: Bearer <CRON_SECRET>
// que Vercel ajoute automatiquement aux invocations de cron.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!gcalConfigured()) return Response.json({ skipped: "gcal non configuré" });

  // Chaque organisation réelle ; jamais le bac à sable (ses formateurs fictifs ne
  // doivent pas écrire dans de vrais agendas).
  const supabase = createAdminClient();
  const { data: orgs, error } = await supabase.from("organizations").select("id").neq("slug", SANDBOX_SLUG);
  if (error) return new Response(error.message, { status: 500 });

  const results = [];
  for (const org of orgs ?? []) {
    results.push({ orgId: org.id, ...(await syncTrainerCalendars(org.id)) });
  }
  return Response.json({ results });
}

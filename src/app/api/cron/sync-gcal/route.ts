import { createAdminClient } from "@/lib/supabase/admin";
import { gcalConfigured, syncTrainerCalendars } from "@/lib/gcal";

// Cron Vercel (cf. vercel.json) : synchronise chaque nuit les agendas Google
// des formateurs. Authentifié par le header Authorization: Bearer <CRON_SECRET>
// que Vercel ajoute automatiquement aux invocations de cron.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!gcalConfigured()) return Response.json({ skipped: "gcal non configuré" });

  // Mono-organisation en pratique ; on synchronise chaque org existante.
  const supabase = createAdminClient();
  const { data: orgs, error } = await supabase.from("organizations").select("id");
  if (error) return new Response(error.message, { status: 500 });

  const results = [];
  for (const org of orgs ?? []) {
    results.push({ orgId: org.id, ...(await syncTrainerCalendars(org.id)) });
  }
  return Response.json({ results });
}

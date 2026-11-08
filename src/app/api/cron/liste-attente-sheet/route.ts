import { createAdminClient } from "@/lib/supabase/admin";
import { productionOrgIds } from "@/lib/production-orgs";
import { readWaitlistSheetState, syncWaitlistSheet } from "@/lib/admission/waitlist-sheet";

export const maxDuration = 120;

// Cron Vercel du lundi matin (cf. vercel.json, 6 h UTC = 7 h à Paris l'hiver, 8 h l'été) :
// réécrit l'onglet « Liste d'attente (ERP) » du Google Sheet relié à chaque organisme réel.
// Authentifié par le header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const results: Record<string, unknown> = {};
  for (const orgId of await productionOrgIds(admin)) {
    const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).single();
    if (!readWaitlistSheetState(org?.settings ?? null)) continue;
    results[orgId] = await syncWaitlistSheet(admin, orgId);
  }
  return Response.json(results);
}

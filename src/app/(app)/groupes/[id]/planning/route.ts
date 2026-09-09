import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanningCsv,
  buildPlanningIcs,
  buildPlanningPdf,
  loadGroupPlanning,
  planningFileName,
  type PlanningAudience,
} from "@/lib/reports/group-planning";

// Planning du groupe à diffuser :
//   ?pour=apprenants|financeur (défaut apprenants) · ?format=pdf|csv|ics (défaut pdf)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();
  const url = new URL(request.url);
  const audience: PlanningAudience = url.searchParams.get("pour") === "financeur" ? "financeur" : "apprenants";
  const format = url.searchParams.get("format") ?? "pdf";

  const supabase = await createClient();
  const planning = await loadGroupPlanning(supabase, id);
  if (!planning) return new Response("Groupe introuvable", { status: 404 });

  const disposition = (name: string) => `attachment; filename="${name}"`;
  if (format === "csv") {
    return new Response(buildPlanningCsv(planning), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition(planningFileName(planning, audience, "csv")) },
    });
  }
  if (format === "ics") {
    return new Response(buildPlanningIcs(planning), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": disposition(planningFileName(planning, audience, "ics")) },
    });
  }
  const pdf = await buildPlanningPdf(planning, audience);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition(planningFileName(planning, audience, "pdf")) },
  });
}

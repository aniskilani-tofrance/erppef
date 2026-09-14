import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadGroupPlanning } from "@/lib/reports/group-planning";
import { buildBundleCsv, buildBundleIcs, buildBundlePdf, bundleFileName } from "@/lib/reports/planning-bundle";

// Tous les plannings des groupes en cours ou à venir, en un seul fichier (affichage à
// l'accueil, impression de la rentrée, envoi global) :
//   /planning/telecharger?pour=apprenants|financeur (défaut apprenants) &format=pdf|csv|ics (défaut pdf)
export async function GET(request: Request) {
  const { orgId } = await requireSession();
  const url = new URL(request.url);
  const audience = url.searchParams.get("pour") === "financeur" ? ("financeur" as const) : ("apprenants" as const);
  const format = url.searchParams.get("format") ?? "pdf";
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from("groups")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ["en_attente", "ouvert"])
    .order("starts_on");
  const plannings = (await Promise.all((groups ?? []).map((g) => loadGroupPlanning(supabase, g.id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (plannings.length === 0) {
    return new Response("Aucun groupe en cours ou à venir.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const season = plannings[0].startsOn.slice(0, 4);
  const bundle = { title: audience === "apprenants" ? "Plannings des cours" : "Plannings prévisionnels des groupes", subtitle: `Tous les groupes — ${season}`, audience, plannings, cover: true };
  const disposition = (ext: "pdf" | "csv" | "ics") => `attachment; filename="${bundleFileName({ ...bundle, subtitle: "tous-les-groupes" }, ext)}"`;
  if (format === "csv") {
    return new Response(buildBundleCsv(plannings), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition("csv") } });
  }
  if (format === "ics") {
    return new Response(buildBundleIcs(plannings, "Cours de français — tous les groupes"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": disposition("ics") } });
  }
  const pdf = await buildBundlePdf(bundle);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition("pdf") } });
}

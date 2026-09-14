import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadGroupPlanning } from "@/lib/reports/group-planning";
import { buildBundleCsv, buildBundleIcs, buildBundlePdf, bundleFileName } from "@/lib/reports/planning-bundle";

// Plannings de tous les groupes en cours d'un financeur, en un seul fichier :
//   ?format=pdf (défaut : page de garde + planning prévisionnel de chaque groupe) | csv | ics
export async function GET(request: Request, { params }: { params: Promise<{ funderId: string }> }) {
  const { funderId } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  const supabase = await createClient();

  const { data: funder } = await supabase.from("funders").select("id, name").eq("id", funderId).eq("org_id", orgId).single();
  if (!funder) return new Response("Financeur introuvable", { status: 404 });

  const { data: groups } = await supabase
    .from("groups")
    .select("id")
    .eq("org_id", orgId)
    .eq("funder_id", funderId)
    .in("status", ["en_attente", "ouvert"])
    .order("starts_on");
  const plannings = (await Promise.all((groups ?? []).map((g) => loadGroupPlanning(supabase, g.id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (plannings.length === 0) {
    return new Response(`Aucun groupe en cours ou à venir financé par ${funder.name}.`, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const bundle = { title: "Plannings des groupes financés", subtitle: funder.name, audience: "financeur" as const, plannings, cover: true };
  const disposition = (ext: "pdf" | "csv" | "ics") => `attachment; filename="${bundleFileName(bundle, ext)}"`;
  if (format === "csv") {
    return new Response(buildBundleCsv(plannings), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition("csv") } });
  }
  if (format === "ics") {
    return new Response(buildBundleIcs(plannings, `Cours ${funder.name}`), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": disposition("ics") } });
  }
  const pdf = await buildBundlePdf(bundle);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition("pdf") } });
}

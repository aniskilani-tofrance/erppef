import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadGroupPlanning } from "@/lib/reports/group-planning";
import { buildBundleIcs, buildBundlePdf, bundleFileName } from "@/lib/reports/planning-bundle";

// Planning personnel d'un apprenant : les groupes où il est inscrit, version apprenants.
//   ?format=pdf (défaut) | ics
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  const supabase = await createClient();

  const { data: learner } = await supabase.from("learners").select("id, first_name, last_name").eq("id", id).eq("org_id", orgId).single();
  if (!learner) return new Response("Apprenant introuvable", { status: 404 });

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("group_id, groups!inner(starts_on)")
    .eq("learner_id", id)
    .eq("status", "inscrit")
    .order("starts_on", { referencedTable: "groups" });
  const plannings = (await Promise.all((enrollments ?? []).map((e) => loadGroupPlanning(supabase, e.group_id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  const name = `${learner.first_name} ${learner.last_name}`.trim();
  if (plannings.length === 0) {
    return new Response(`${name} n'est inscrit(e) dans aucun groupe : inscrivez-le d'abord (fiche groupe → Inscrire), puis téléchargez son planning.`, {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const bundle = { title: "Vos plannings de cours", subtitle: name, audience: "apprenants" as const, plannings };
  const disposition = (ext: "pdf" | "ics") => `attachment; filename="${bundleFileName(bundle, ext)}"`;
  if (format === "ics") {
    return new Response(buildBundleIcs(plannings, `Cours de français — ${learner.first_name}`), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": disposition("ics") },
    });
  }
  const pdf = await buildBundlePdf(bundle);
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition("pdf") } });
}

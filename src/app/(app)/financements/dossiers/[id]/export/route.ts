import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FINANCEMENTS_ROLES } from "@/lib/financements/constants";
import { buildApplicationDocx, exportFileName } from "@/lib/financements/export-word";
import { formatDueAt, formatEuros } from "@/lib/financements/liens";

// Export Word d'un dossier, à la charte : pour la relecture et l'archive dans le Drive.
// Admin et coordination seulement ; filtré par l'organisation de la session.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Dossier invalide", { status: 400 });
  const { orgId } = await requireRole([...FINANCEMENTS_ROLES]);
  const supabase = await createClient();
  const [{ data: a }, { data: sections }, { data: org }] = await Promise.all([
    supabase.from("funding_applications").select("title, amount_requested, deadline_at, funders(name)").eq("id", id).eq("org_id", orgId).maybeSingle(),
    supabase
      .from("funding_application_sections")
      .select("title, content, max_chars")
      .eq("org_id", orgId)
      .eq("application_id", id)
      .order("position")
      .order("created_at"),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  if (!a) return new Response("Dossier introuvable", { status: 404 });
  if (!sections?.length) return new Response("Ce dossier n'a pas encore de rubrique à exporter.", { status: 404 });

  const docx = await buildApplicationDocx({
    orgName: org?.name ?? "Association",
    title: a.title,
    funderName: (a.funders as unknown as { name: string } | null)?.name ?? null,
    deadline: a.deadline_at ? formatDueAt(a.deadline_at) : null,
    amountRequested: a.amount_requested === null ? null : formatEuros(a.amount_requested),
    sections: sections.map((s) => ({ title: s.title, content: s.content, max_chars: s.max_chars })),
    generatedOn: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }),
  });

  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${exportFileName(a.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { requireSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emptyResponse, loadContactContext, selectionOf, userCanExportContacts, vcfResponse } from "@/lib/contacts/load";

// Téléchargement du fichier .vcf des inscrits du groupe (?mode=tout|nouveaux), toujours
// calculé au moment du clic. Chaque téléchargement est inscrit au journal des imports.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, userId } = await requireSession();
  const mode = new URL(request.url).searchParams.get("mode") === "nouveaux" ? "nouveaux" : "tout";
  const admin = createAdminClient();
  if (!(await userCanExportContacts(admin, orgId, id, userId))) return new Response("Groupe introuvable", { status: 404 });

  const ctx = await loadContactContext(admin, orgId, id, userId);
  if (!ctx) return new Response("Groupe introuvable", { status: 404 });
  const selection = selectionOf(ctx, mode);
  if (selection.toExport.length === 0) return emptyResponse(mode);

  const { error } = await admin.from("group_contact_exports").insert({
    org_id: orgId,
    group_id: id,
    user_id: userId,
    mode,
    learner_ids: selection.toExport.map((m) => m.learnerId),
    downloaded_at: new Date().toISOString(),
  });
  if (error) return new Response("Journal des imports indisponible, réessayez.", { status: 500 });
  return vcfResponse(ctx, selection, mode);
}

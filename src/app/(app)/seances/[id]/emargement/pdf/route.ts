import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSessionAccess } from "@/lib/stagiaires";
import { buildAttendancePdf, loadAttendanceSheetData, sheetFileName } from "@/lib/emargement/pdf";

// Téléchargement de la feuille d'émargement PDF (équipe, et stagiaire pour les séances de ses groupes).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole(["admin", "coordinator", "trainer", "stagiaire"]);
  const { orgId } = ctx;
  if (!(await assertSessionAccess(createAdminClient(), ctx, id))) return new Response("Séance introuvable", { status: 404 });

  const data = await loadAttendanceSheetData(id, orgId);
  if (!data) return new Response("Séance introuvable", { status: 404 });

  const pdf = await buildAttendancePdf(data);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sheetFileName(data)}"`,
    },
  });
}

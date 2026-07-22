import { requireRole } from "@/lib/auth";
import { buildAttendancePdf, loadAttendanceSheetData, sheetFileName } from "@/lib/emargement/pdf";

// Téléchargement de la feuille d'émargement PDF (équipe uniquement).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireRole(["admin", "coordinator", "trainer"]);

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

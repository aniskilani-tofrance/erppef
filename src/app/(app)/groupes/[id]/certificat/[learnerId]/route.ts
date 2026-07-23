import { requireRole } from "@/lib/auth";
import {
  buildCertificatePdf,
  certificateFileName,
  loadCertificateData,
} from "@/lib/emargement/certificat";

// Téléchargement du certificat de réalisation d'un apprenant pour ce groupe.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; learnerId: string }> },
) {
  const { id, learnerId } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);

  const data = await loadCertificateData(id, learnerId, orgId);
  if (!data) return new Response("Introuvable", { status: 404 });
  if (data.sessionsAttended === 0) {
    return new Response("Aucune séance émargée suivie : certificat sans objet.", { status: 400 });
  }

  const pdf = await buildCertificatePdf(data);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${certificateFileName(data)}"`,
    },
  });
}

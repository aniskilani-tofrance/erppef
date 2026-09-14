import { requireRole } from "@/lib/auth";
import { attestationFileName, buildAttestationPdf, loadAttestationData } from "@/lib/evaluations/attestation";

// Attestation d'acquis (fin de parcours) d'un apprenant pour ce groupe.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; learnerId: string }> }) {
  const { id, learnerId } = await params;
  const { orgId } = await requireRole(["admin", "coordinator", "trainer"]);

  const data = await loadAttestationData(id, learnerId, orgId);
  if (!data) {
    return new Response("Pas d'évaluation finale saisie pour cet apprenant : remplissez d'abord la grille de fin de parcours.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const pdf = await buildAttestationPdf(data);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${attestationFileName(data)}"` },
  });
}

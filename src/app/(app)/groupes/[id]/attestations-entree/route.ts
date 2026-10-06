import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildEntryAttestationsPdf, entryAttestationFileName, loadEntryAttestations } from "@/lib/attestations/entree";

// Attestations d'entrée en formation du groupe : un PDF, une page par apprenant ayant au
// moins une présence émargée (à imprimer et remettre en cours). ?apprenant=<id> → une seule.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireRole(["admin", "coordinator", "trainer"]);
  const learnerId = new URL(request.url).searchParams.get("apprenant") ?? undefined;
  const supabase = await createClient();

  const list = await loadEntryAttestations(supabase, id, orgId, learnerId);
  if (!list.length) {
    return new Response(
      "Aucune attestation à produire : il faut au moins une présence sur une feuille d'émargement clôturée.",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  const pdf = await buildEntryAttestationsPdf(list);
  const name = entryAttestationFileName(list[0].groupName, learnerId ? list[0].learnerName : undefined);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
  });
}

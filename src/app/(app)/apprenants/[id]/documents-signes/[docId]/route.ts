import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocumentFileName } from "@/lib/documents-apprenant/pdf";
import type { SignedDocumentKind } from "@/lib/documents-apprenant/regles";
import { isUuid } from "@/lib/documents-apprenant/serveur";

// PDF signé (adhésion, contrat, règlement) du dossier privé : admin et coordination
// seulement, comme les autres pièces du dossier administratif.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);
  if (!isUuid(id) || !isUuid(docId)) return new Response("Document introuvable", { status: 404 });
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("learner_signed_documents")
    .select("kind, signer_name, file_path")
    .eq("id", docId)
    .eq("learner_id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!doc) return new Response("Document introuvable", { status: 404 });
  const { data: file } = await admin.storage.from("dossiers").download(doc.file_path as string);
  if (!file) return new Response("Fichier introuvable", { status: 404 });
  return new Response(Buffer.from(await file.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${signedDocumentFileName(doc.kind as SignedDocumentKind, doc.signer_name as string)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

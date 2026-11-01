import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_DOCUMENT_KINDS, type SignedDocumentKind } from "@/lib/documents-apprenant/regles";
import { loadSigningContext } from "@/lib/documents-apprenant/serveur";
import { signedDocumentFileName } from "@/lib/documents-apprenant/pdf";

// Copie PDF d'un document signé, pour la personne du lien (exemplaire remis au stagiaire).
// Le jeton est le secret ; seuls ses propres documents, tant que le lien est valable.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  if (!(SIGNED_DOCUMENT_KINDS as readonly string[]).includes(kind)) return new Response("Document inconnu", { status: 404 });
  const admin = createAdminClient();
  const lookup = await loadSigningContext(admin, token);
  if (!lookup.ok) return new Response("Lien invalide ou expiré", { status: 404 });
  const state = lookup.ctx.states[kind as SignedDocumentKind];
  if (state.state !== "signe" || !state.docId) return new Response("Document pas encore signé", { status: 404 });

  const { data: doc } = await admin
    .from("learner_signed_documents")
    .select("file_path")
    .eq("id", state.docId)
    .eq("learner_id", lookup.ctx.learnerId)
    .eq("org_id", lookup.ctx.orgId)
    .maybeSingle();
  if (!doc) return new Response("Document introuvable", { status: 404 });
  const { data: file } = await admin.storage.from("dossiers").download(doc.file_path as string);
  if (!file) return new Response("Document introuvable", { status: 404 });
  return new Response(Buffer.from(await file.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${signedDocumentFileName(kind as SignedDocumentKind, lookup.ctx.learnerName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

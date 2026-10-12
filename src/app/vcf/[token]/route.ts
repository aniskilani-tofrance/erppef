import { createAdminClient } from "@/lib/supabase/admin";
import { emptyResponse, loadContactContext, selectionOf, userCanExportContacts, vcfResponse } from "@/lib/contacts/load";

// Lien « sur le téléphone » (QR code de la fiche du groupe) : ouvert sans session, le
// jeton est le secret. Usage unique, 15 minutes. Le droit d'accès de l'utilisateur qui a
// créé le lien est revérifié au moment du téléchargement.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return new Response("Lien invalide", { status: 404 });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("group_contact_exports")
    .select("id, org_id, group_id, user_id, mode, token_expires_at, downloaded_at")
    .eq("token", token)
    .maybeSingle();
  const gone = (msg: string) => new Response(msg, { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (!row) return new Response("Lien invalide", { status: 404 });
  if (row.downloaded_at) return gone("Ce lien a déjà servi. Générez-en un nouveau depuis la fiche du groupe.");
  if (!row.token_expires_at || new Date(row.token_expires_at as string).getTime() < Date.now()) {
    return gone("Ce lien a expiré (15 minutes). Générez-en un nouveau depuis la fiche du groupe.");
  }
  const orgId = row.org_id as string;
  const groupId = row.group_id as string;
  const userId = row.user_id as string;
  const mode = row.mode === "nouveaux" ? "nouveaux" : "tout";
  if (!(await userCanExportContacts(admin, orgId, groupId, userId))) return new Response("Lien invalide", { status: 404 });

  const ctx = await loadContactContext(admin, orgId, groupId, userId);
  if (!ctx) return new Response("Lien invalide", { status: 404 });
  const selection = selectionOf(ctx, mode);
  if (selection.toExport.length === 0) return emptyResponse(mode);

  // Le lien est consommé avant l'envoi : un second appel (aperçu, double clic) est refusé.
  const { data: claimed } = await admin
    .from("group_contact_exports")
    .update({ downloaded_at: new Date().toISOString(), learner_ids: selection.toExport.map((m) => m.learnerId) })
    .eq("id", row.id)
    .is("downloaded_at", null)
    .select("id");
  if (!claimed?.length) return gone("Ce lien a déjà servi. Générez-en un nouveau depuis la fiche du groupe.");
  return vcfResponse(ctx, selection, mode);
}

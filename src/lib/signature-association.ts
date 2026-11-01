import type { SupabaseClient } from "@supabase/supabase-js";
import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

// Signature du président et cachet de l'association : une image PNG posée sur les documents
// émis au nom de l'association (bulletin d'adhésion, contrat, règlement intérieur, reçu de
// cotisation, attestation d'entrée en formation).
// JAMAIS dans le dépôt de code (il est public) : l'image vit dans le bucket privé « dossiers »,
// sous « association/<org_id>/… », hors des dossiers des organismes (« <org_id>/… ») : aucune
// politique de stockage ne l'ouvre, seul le serveur (service_role) la lit.
// Image absente ou illisible : le document sort quand même, « Signature et cachet » à la main.

export const SIGNATURE_BUCKET = "dossiers";

export function associationSignaturePath(orgId: string): string {
  return `association/${orgId}/signature-cachet.png`;
}

/** Image PNG de la signature et du cachet de l'organisme, ou null si absente. */
export async function loadAssociationSignature(admin: SupabaseClient, orgId: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await admin.storage.from(SIGNATURE_BUCKET).download(associationSignaturePath(orgId));
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Image PNG intégrée au PDF, ou null si absente ou illisible. */
export async function embedPngOrNull(doc: PDFDocument, png: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!png?.length) return null;
  try {
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

/** Dessine l'image dans un cadre (coin bas gauche x, y), proportions gardées. */
export function drawImageInBox(page: PDFPage, image: PDFImage, box: { x: number; y: number; width: number; height: number }) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  page.drawImage(image, { x: box.x, y: box.y, width: image.width * scale, height: image.height * scale });
}

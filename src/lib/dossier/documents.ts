// Dossier administratif de l'apprenant : pièces scannées ou déposées (pièce d'identité
// recto/verso, justificatif de domicile, autres). Stockage dans le bucket PRIVÉ « dossiers »,
// réservé par RLS aux rôles admin et coordinator de l'organisme ; lecture par lien signé (1 h).

export type LearnerDocumentKind = "identite_recto" | "identite_verso" | "justificatif_domicile" | "autre";

export type DocumentSlot = { kind: Exclude<LearnerDocumentKind, "autre">; label: string; hint: string };

// Les trois pièces attendues à l'inscription (ordre d'affichage).
export const DOCUMENT_SLOTS: DocumentSlot[] = [
  { kind: "identite_recto", label: "Pièce d'identité — recto", hint: "CNI, titre de séjour ou passeport" },
  { kind: "identite_verso", label: "Pièce d'identité — verso", hint: "dos de la carte (rien pour un passeport)" },
  { kind: "justificatif_domicile", label: "Justificatif de domicile", hint: "facture, quittance ou attestation d'hébergement de moins de 3 mois" },
];

export const KIND_LABELS: Record<LearnerDocumentKind, string> = {
  identite_recto: "Pièce d'identité — recto",
  identite_verso: "Pièce d'identité — verso",
  justificatif_domicile: "Justificatif de domicile",
  autre: "Autre document",
};

export const DOCUMENT_KINDS = Object.keys(KIND_LABELS) as LearnerDocumentKind[];

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

/** Message d'erreur lisible, ou null si le fichier est acceptable (image ou PDF, ≤ 15 Mo). */
export function checkDocumentFile(file: { type: string; size: number; name: string }): string | null {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okByMime = isImageMime(mime) || mime === "application/pdf";
  const okByExt = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext);
  if (!okByMime && !okByExt) return "Format non accepté : photo (JPG, PNG, HEIC) ou PDF.";
  if (file.size <= 0) return "Le fichier est vide.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Fichier trop lourd (15 Mo maximum).";
  return null;
}

/** Extension de stockage déduite du type MIME, sinon du nom du fichier. */
export function documentExtension(file: { type: string; name: string }): string {
  const byMime = EXT_BY_MIME[file.type.toLowerCase()];
  if (byMime) return byMime;
  const ext = file.name.includes(".") ? (file.name.split(".").pop()?.toLowerCase() ?? "") : "";
  return ext === "jpeg" ? "jpg" : ext || "bin";
}

/** Chemin dans le bucket « dossiers » : <org>/apprenants/<apprenant>/<type>-<id>.<ext>. */
export function documentStoragePath(orgId: string, learnerId: string, kind: LearnerDocumentKind, ext: string, id: string): string {
  return `${orgId}/apprenants/${learnerId}/${kind}-${id}.${ext}`;
}

/** Préfixe des pièces d'un apprenant (nettoyage à la suppression de la fiche). */
export function learnerDocumentsPrefix(orgId: string, learnerId: string): string {
  return `${orgId}/apprenants/${learnerId}`;
}

export type DossierCompleteness = { done: number; total: number; missing: DocumentSlot[] };

/** Avancement du dossier : combien des trois pièces attendues sont présentes. */
export function dossierCompleteness(docs: { kind: LearnerDocumentKind }[]): DossierCompleteness {
  const present = new Set(docs.map((d) => d.kind));
  const missing = DOCUMENT_SLOTS.filter((s) => !present.has(s.kind));
  return { done: DOCUMENT_SLOTS.length - missing.length, total: DOCUMENT_SLOTS.length, missing };
}

/** Libellé par défaut d'une pièce (le nom du fichier n'est pas parlant après un scan). */
export function defaultLabel(kind: LearnerDocumentKind, fileName: string): string {
  if (kind !== "autre") return KIND_LABELS[kind];
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Document";
}

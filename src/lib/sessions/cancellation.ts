// Motifs d'annulation d'une séance : affichés dans le planning, la fiche du groupe et
// gardés en base (preuve pour le financeur et Qualiopi). Même liste que la contrainte SQL
// de la migration 0041.

export const CANCEL_REASONS = ["absence_formateur", "fermeture_lieu", "effectif_insuffisant", "autre"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  absence_formateur: "Absence imprévue du formateur",
  fermeture_lieu: "Fermeture du lieu",
  effectif_insuffisant: "Effectif insuffisant",
  autre: "Autre motif",
};

/** « Annulée · Absence imprévue du formateur (grève RATP) » — ou « Annulée » pour les anciennes séances sans motif. */
export function describeCancellation(reason: string | null, note: string | null): string {
  const label = reason && reason in CANCEL_REASON_LABELS ? CANCEL_REASON_LABELS[reason as CancelReason] : null;
  const detail = note?.trim();
  if (!label) return detail ? `Annulée · ${detail}` : "Annulée";
  return detail ? `Annulée · ${label} (${detail})` : `Annulée · ${label}`;
}

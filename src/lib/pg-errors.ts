// Les contraintes Postgres SONT les messages de conflit : on les traduit, on ne les pré-vérifie pas.
type PgError = { code?: string; message: string };

const APPOINTMENT_OVERLAP = "admission_appointments_no_overlap";

/** Deux RDV d'admission « prévus » qui se chevauchent (verrou 0053) : créneau pris entre-temps. */
export function isAppointmentOverlap(error: PgError | null | undefined): boolean {
  return !!error && error.message.includes(APPOINTMENT_OVERLAP);
}

export function translatePgError(error: PgError): string {
  if (error.message.includes("poei_candidates_consent_before_progress")) {
    return "Recueillez d'abord le consentement du candidat (transmission de ses coordonnées pour la POEI).";
  }
  if (error.message.includes("no_room_overlap")) {
    return "Conflit : la salle est déjà occupée sur ce créneau.";
  }
  if (error.message.includes("no_absence_overlap")) {
    return "Conflit : une absence existe déjà sur cette période.";
  }
  if (error.message.includes("no_room_unavailability_overlap")) {
    return "Conflit : une indisponibilité existe déjà sur cette période.";
  }
  // Avant le 23P01 générique (formateur) : même code d'erreur, autre contrainte.
  if (isAppointmentOverlap(error)) {
    return "Conflit : un autre rendez-vous d'admission est déjà prévu sur ce créneau. Choisissez un autre horaire.";
  }
  if (error.code === "23P01" || error.message.includes("no_trainer_overlap")) {
    return "Conflit : le formateur a déjà une séance sur ce créneau.";
  }
  if (error.code === "23505") {
    return "Doublon : un enregistrement identique existe déjà.";
  }
  if (error.code === "23503") {
    return "Référence invalide : l'élément lié n'existe plus.";
  }
  return `Erreur : ${error.message}`;
}

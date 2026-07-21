// Les contraintes Postgres SONT les messages de conflit : on les traduit, on ne les pré-vérifie pas.
type PgError = { code?: string; message: string };

export function translatePgError(error: PgError): string {
  if (error.message.includes("no_room_overlap")) {
    return "Conflit : la salle est déjà occupée sur ce créneau.";
  }
  if (error.message.includes("no_absence_overlap")) {
    return "Conflit : une absence existe déjà sur cette période.";
  }
  if (error.message.includes("no_room_unavailability_overlap")) {
    return "Conflit : une indisponibilité existe déjà sur cette période.";
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

// Règles du module congés (pur, testable).
//   salarié      → demande à valider par l'admin ou la coordination (« en_attente »)
//   vacataire / prestataire → absence enregistrée directement (« approuvee »)

export type ContractType = "salarie" | "vacataire" | "prestataire";
export type AbsenceStatus = "en_attente" | "approuvee" | "refusee";
export type AbsenceKind = "conge" | "maladie" | "formation" | "autre";

export const KIND_LABELS: Record<AbsenceKind, string> = {
  conge: "Congé",
  maladie: "Maladie",
  formation: "Formation",
  autre: "Autre",
};

export const STATUS_LABELS: Record<AbsenceStatus, string> = {
  en_attente: "À valider",
  approuvee: "Validée",
  refusee: "Refusée",
};

export function needsApproval(contract: ContractType): boolean {
  return contract === "salarie";
}

export function initialStatus(contract: ContractType): AbsenceStatus {
  return needsApproval(contract) ? "en_attente" : "approuvee";
}

// Libellé du bouton et du message de confirmation selon le contrat
export function requestWording(contract: ContractType): { button: string; done: string } {
  return needsApproval(contract)
    ? { button: "Demander un congé", done: "Demande envoyée : la coordination vous répond par email." }
    : { button: "Déclarer une absence", done: "Absence enregistrée : la coordination est prévenue." };
}

// Nombre de jours inclus entre deux dates YYYY-MM-DD
export function daysBetween(startsOn: string, endsOn: string): number {
  const a = new Date(`${startsOn}T12:00:00Z`).getTime();
  const b = new Date(`${endsOn}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

// Séances (dates locales) qui tombent dans la période : à déplacer par la coordination
export function sessionsInRange(sessionDays: string[], startsOn: string, endsOn: string): number {
  return sessionDays.filter((d) => d >= startsOn && d <= endsOn).length;
}

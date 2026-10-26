// Statuts d'émargement : la seule source des valeurs, des libellés et des règles de
// calcul qui en découlent. PUR (aucun accès base) : utilisable côté serveur et client.
//
// Règles (décision du 26/10/2026) :
//  • présent et retard = séance suivie (heures réalisées) ;
//  • absent = absence ; elle remonte dans « Absents à relancer » et dans les séries ;
//  • excusé = absence justifiée (la personne a prévenu). Elle compte comme une absence
//    pour les heures (heures non réalisées) mais se montre à part (« dont X absences
//    justifiées ») ; elle n'est jamais relancée et n'allonge pas une série d'absences.

export const ATTENDANCE_STATUSES = ["present", "retard", "absent", "excuse"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  retard: "Retard",
  absent: "Absent",
  excuse: "Excusé",
};

// Motif d'une absence excusée : une ligne courte (même limite que la contrainte SQL).
export const EXCUSE_REASON_MAX = 200;

/** Séance suivie : présent ou en retard. Tout le reste est une absence (justifiée ou non). */
export function isAttended(status: string | null | undefined): boolean {
  return status === "present" || status === "retard";
}

/** Absence justifiée (prévenue). */
export function isExcused(status: string | null | undefined): boolean {
  return status === "excuse";
}

/** « dont 1 absence justifiée », « dont 3 absences justifiées » ; vide s'il n'y en a pas. */
export function excusedAbsencesLabel(count: number): string {
  if (count <= 0) return "";
  return `dont ${count} absence${count > 1 ? "s" : ""} justifiée${count > 1 ? "s" : ""}`;
}

/** « 4 absences, dont 1 absence justifiée » ; « 1 absence » ; « aucune absence ». */
export function absencesSummary(absences: number, excused: number): string {
  if (absences <= 0) return "aucune absence";
  const base = `${absences} absence${absences > 1 ? "s" : ""}`;
  return excused > 0 ? `${base}, ${excusedAbsencesLabel(excused)}` : base;
}

/** Version courte pour les listes : « 1 abs. justifiée », « 2 abs. justifiées ». */
export function excusedShortLabel(count: number): string {
  if (count <= 0) return "";
  return `${count} abs. justifiée${count > 1 ? "s" : ""}`;
}

// Base pas encore à jour (migration 0055 non appliquée) : la valeur « excuse » ou les
// colonnes excuse_* n'existent pas. On le dit clairement au lieu d'une erreur SQL.
export const EXCUSE_UNAVAILABLE =
  "Statut « Excusé » indisponible : la base de données n'est pas encore à jour. Contactez l'administrateur.";

export function isExcuseSchemaMissing(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (/excuse_reason|excused_by|excused_at/i.test(message)) return true;
  // 22P02 : « invalid input value for enum attendance_status: "excuse" »
  if (error.code === "22P02" && /attendance_status|excuse/i.test(message)) return true;
  return /invalid input value for enum attendance_status/i.test(message);
}

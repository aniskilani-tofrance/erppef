// Statistiques d'assiduité calculées à partir des émargements des séances CLÔTURÉES
// (une feuille non clôturée est encore en cours : elle ne compte pas).
//
// Absence excusée (statut « excuse ») : c'est une absence pour les heures et le taux de
// présence (heures non réalisées), comptée à part dans `excused`. Pour la série
// d'absences et les alertes de décrochage, elle est transparente : elle n'allonge pas la
// série et ne l'interrompt pas (absent, excusé, absent = 2 absences de suite).

import { isAttended, isExcused, type AttendanceStatus } from "@/lib/attendance-status";

export type AttendanceRecord = {
  learnerId: string;
  status: AttendanceStatus;
  startsAt: string; // ISO — sert à ordonner pour la série d'absences consécutives
  hours?: number; // durée de la séance (heures suivies)
};

export type LearnerStats = {
  total: number;
  attended: number; // présent + retard
  late: number;
  absent: number; // toutes les absences, justifiées comprises
  excused: number; // dont absences justifiées (excusé)
  rate: number; // % de présence (0-100) : une absence justifiée compte comme une absence
  hoursAttended: number;
  hoursExcused: number; // heures non réalisées pour absence justifiée
  consecutiveAbsences: number; // absences NON justifiées d'affilée sur les dernières séances
  // Taux de présence hors absences justifiées : sert aux alertes de décrochage (une
  // absence prévenue n'est pas un signal de décrochage). null si seulement des excusés.
  unexcusedTotal: number;
  unexcusedRate: number | null;
};

export function computeLearnerStats(records: AttendanceRecord[]): Map<string, LearnerStats> {
  const byLearner = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const list = byLearner.get(r.learnerId) ?? [];
    list.push(r);
    byLearner.set(r.learnerId, list);
  }

  const stats = new Map<string, LearnerStats>();
  for (const [learnerId, list] of byLearner) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const attended = list.filter((r) => isAttended(r.status));
    const excused = list.filter((r) => isExcused(r.status));
    // Série : on remonte depuis la dernière séance en sautant les absences justifiées
    let streak = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (isExcused(list[i].status)) continue;
      if (isAttended(list[i].status)) break;
      streak += 1;
    }
    const unexcusedTotal = list.length - excused.length;
    stats.set(learnerId, {
      total: list.length,
      attended: attended.length,
      late: list.filter((r) => r.status === "retard").length,
      absent: list.length - attended.length,
      excused: excused.length,
      rate: Math.round((attended.length / list.length) * 100),
      hoursAttended: attended.reduce((sum, r) => sum + (r.hours ?? 0), 0),
      hoursExcused: excused.reduce((sum, r) => sum + (r.hours ?? 0), 0),
      consecutiveAbsences: streak,
      unexcusedTotal,
      unexcusedRate: unexcusedTotal ? Math.round((attended.length / unexcusedTotal) * 100) : null,
    });
  }
  return stats;
}

/** Taux global sur un lot d'émargements : présents + retards / tous (excusés = absences). */
export function globalAttendance(records: { status: string }[]): { total: number; attended: number; excused: number; rate: number | null } {
  const attended = records.filter((r) => isAttended(r.status)).length;
  const excused = records.filter((r) => isExcused(r.status)).length;
  return {
    total: records.length,
    attended,
    excused,
    rate: records.length ? Math.round((attended / records.length) * 100) : null,
  };
}

export function sessionHours(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

// Seuil d'alerte : 3 absences consécutives = risque de décrochage.
export const ABSENCE_ALERT_THRESHOLD = 3;

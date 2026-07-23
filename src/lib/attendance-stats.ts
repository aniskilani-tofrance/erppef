// Statistiques d'assiduité calculées à partir des émargements des séances CLÔTURÉES
// (une feuille non clôturée est encore en cours : elle ne compte pas).

export type AttendanceRecord = {
  learnerId: string;
  status: "present" | "retard" | "absent";
  startsAt: string; // ISO — sert à ordonner pour la série d'absences consécutives
  hours?: number; // durée de la séance (heures suivies)
};

export type LearnerStats = {
  total: number;
  attended: number; // présent + retard
  late: number;
  absent: number;
  rate: number; // % de présence (0-100)
  hoursAttended: number;
  consecutiveAbsences: number; // absences d'affilée sur les dernières séances
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
    const attended = list.filter((r) => r.status !== "absent");
    let streak = 0;
    for (let i = list.length - 1; i >= 0 && list[i].status === "absent"; i--) streak += 1;
    stats.set(learnerId, {
      total: list.length,
      attended: attended.length,
      late: list.filter((r) => r.status === "retard").length,
      absent: list.length - attended.length,
      rate: Math.round((attended.length / list.length) * 100),
      hoursAttended: attended.reduce((sum, r) => sum + (r.hours ?? 0), 0),
      consecutiveAbsences: streak,
    });
  }
  return stats;
}

export function sessionHours(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

// Seuil d'alerte : 3 absences consécutives = risque de décrochage.
export const ABSENCE_ALERT_THRESHOLD = 3;

import {
  defaultPattern,
  patternWeeklyHours,
  roomHardViolations,
  trainerHardViolations,
  trainerSoftNotes,
} from "./constraints";
import { generateSessions } from "./recurrence";
import type {
  EngineData,
  Proposal,
  ProposalInput,
  RankedRoom,
  RankedTrainer,
  Warning,
} from "./types";

// Cœur du moteur : PUR (aucun accès base). TS propose, Postgres garantit au commit.
export function proposeGroupPlan(input: ProposalInput, data: EngineData): Proposal {
  const warnings: Warning[] = [];

  // 1. Motif hebdo : imposé par le coordinateur ou dérivé du rythme du dispositif.
  const pattern =
    input.weeklyPattern?.length
      ? input.weeklyPattern
      : defaultPattern(input.defaultWeeklyHours ?? 15);
  if (!input.weeklyPattern?.length && !input.defaultWeeklyHours) {
    warnings.push({
      code: "default_rhythm",
      message: "Aucun rythme défini sur le dispositif : 15 h/semaine appliquées par défaut",
    });
  }

  // 2. Matérialisation des séances. Fériés et fermetures org toujours sautés ;
  // vacances scolaires sautées sauf si le groupe a explicitement cours pendant.
  const closures =
    input.skipSchoolHolidays === false
      ? data.closures.filter((c) => c.kind !== "vacances_scolaires")
      : data.closures;
  const recurrence = generateSessions({
    pattern,
    startsOn: input.startsOn,
    totalHours: input.totalHours,
    closures,
    tz: data.timezone,
  });
  if (recurrence.truncatedLast) {
    warnings.push({
      code: "truncated_last",
      message: `Volume (${input.totalHours} h) non divisible par le rythme hebdo (${patternWeeklyHours(pattern)} h) : dernière séance raccourcie`,
    });
  }
  if (recurrence.exhausted) {
    warnings.push({
      code: "horizon_exceeded",
      message: "Garde-fou atteint (18 mois / 400 séances) : volume horaire non entièrement planifié",
    });
  }

  // 3. Classement des formateurs : filtres durs puis tri salarié → coût → priorité → score souple.
  const rankedTrainers: RankedTrainer[] = data.trainers.map((t) => {
    const hardViolations = trainerHardViolations(t, pattern, recurrence.sessions);
    const soft = trainerSoftNotes(t, input.requiredSkills, input.level, recurrence.sessions);
    const notes = [...soft.notes];
    let preferenceBonus = 0;
    if (input.preferredTrainerId === t.id) {
      notes.push("Formateur demandé par le coordinateur");
      preferenceBonus = 50;
    }
    return {
      trainerId: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
      contractType: t.contractType,
      hourlyCost: t.hourlyCost,
      priority: t.priority,
      score: soft.bonus + preferenceBonus - soft.penalty,
      projectedCost: Math.round(input.totalHours * t.hourlyCost * 100) / 100,
      hardViolations,
      softNotes: notes,
    };
  });
  rankedTrainers.sort(compareTrainers);
  const eligibleTrainers = rankedTrainers.filter((t) => t.hardViolations.length === 0);
  const trainer = eligibleTrainers[0] ?? null;
  if (!trainer) {
    warnings.push({
      code: "no_trainer",
      message: "Aucun formateur éligible sur ce motif : ajuster le rythme ou les disponibilités",
    });
  }

  // 4. Classement des salles : plus petite salle suffisante d'abord (préserver les grandes).
  const rankedRooms: RankedRoom[] = data.rooms.map((r) => {
    const hardViolations = roomHardViolations(r, recurrence.sessions, input.expectedHeadcount);
    const softNotes: string[] = [];
    if (input.preferredRoomId === r.id) softNotes.push("Salle demandée par le coordinateur");
    return { roomId: r.id, name: r.name, capacity: r.capacity, hardViolations, softNotes };
  });
  rankedRooms.sort((a, b) => {
    const prefA = a.softNotes.length > 0 ? 0 : 1;
    const prefB = b.softNotes.length > 0 ? 0 : 1;
    if (prefA !== prefB) return prefA - prefB;
    return a.capacity - b.capacity;
  });
  const eligibleRooms = rankedRooms.filter((r) => r.hardViolations.length === 0);
  const room = eligibleRooms[0] ?? null;
  if (!room) {
    warnings.push({
      code: "no_room",
      message: "Aucune salle disponible sur l'ensemble des créneaux proposés",
    });
  }

  const lastSession = recurrence.sessions[recurrence.sessions.length - 1] ?? null;

  return {
    trainer,
    trainerAlternatives: rankedTrainers,
    room,
    roomAlternatives: rankedRooms,
    weeklyPattern: pattern,
    sessions: recurrence.sessions,
    totals: {
      hours: Math.round(recurrence.sessions.reduce((s, x) => s + x.hours, 0) * 10) / 10,
      cost: trainer ? trainer.projectedCost : null,
      endsOn: lastSession?.localDate ?? null,
      skippedClosures: recurrence.skipped,
    },
    warnings,
  };
}

// Tri lexicographique : éligibles d'abord, puis salarié avant vacataire,
// coût horaire croissant, priorité manuelle croissante, score souple décroissant.
function compareTrainers(a: RankedTrainer, b: RankedTrainer): number {
  const eligA = a.hardViolations.length === 0 ? 0 : 1;
  const eligB = b.hardViolations.length === 0 ? 0 : 1;
  if (eligA !== eligB) return eligA - eligB;
  if (a.contractType !== b.contractType) return a.contractType === "salarie" ? -1 : 1;
  if (a.hourlyCost !== b.hourlyCost) return a.hourlyCost - b.hourlyCost;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.score !== b.score) return b.score - a.score;
  return 0;
}

import { isoWeekday, utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { intervalHours, trainerHardViolations, trainerSoftNotes } from "./constraints";
import { compareTrainers } from "./propose";
import type { EngineData, RankedTrainer, SlotPattern } from "./types";

// Remplaçants possibles pour UNE séance (formatrice absente, ou séance sans formateur).
// PUR : mêmes filtres durs que le moteur de planning (disponibilités, absences validées,
// plafond hebdo, conflit de créneau) et même tri (salariés, coût, priorité ; stagiaires
// et bénévoles en dernier). L'ancienne formatrice de la séance est exclue.
export type ReplacementSession = {
  startsAt: string; // ISO UTC
  endsAt: string;
  level: string | null;
  excludeTrainerId: string | null;
};

export function rankReplacements(session: ReplacementSession, data: EngineData): RankedTrainer[] {
  const localDate = utcToLocalDate(session.startsAt, data.timezone);
  const slot: SlotPattern = {
    weekday: isoWeekday(localDate) as SlotPattern["weekday"],
    start: utcToLocalTime(session.startsAt, data.timezone),
    end: utcToLocalTime(session.endsAt, data.timezone),
  };
  const proposed = [
    {
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      localDate,
      hours: intervalHours(session.startsAt, session.endsAt),
    },
  ];

  return data.trainers
    .filter((t) => t.isActive && t.id !== session.excludeTrainerId)
    .map((t) => {
      const soft = trainerSoftNotes(t, [], session.level, proposed);
      return {
        trainerId: t.id,
        name: `${(t.firstName ?? "").trim()} ${(t.lastName ?? "").trim()}`.trim(),
        contractType: t.contractType,
        hourlyCost: t.hourlyCost,
        priority: t.priority,
        score: soft.bonus - soft.penalty,
        projectedCost: Math.round(proposed[0].hours * t.hourlyCost * 100) / 100,
        hardViolations: trainerHardViolations(t, [slot], proposed),
        softNotes: soft.notes,
      };
    })
    .sort(compareTrainers);
}

import { dateInRange, overlaps, slotHours, weekStartOf } from "@/lib/dates";
import type {
  ProposedSession,
  RoomData,
  SlotPattern,
  TrainerData,
} from "./types";

// Filtres DURS d'un formateur pour un plan de séances donné.
// Chaque violation est une phrase française prête à afficher dans l'écran de revue.
export function trainerHardViolations(
  trainer: TrainerData,
  pattern: SlotPattern[],
  sessions: ProposedSession[],
): string[] {
  const violations: string[] = [];

  if (!trainer.isActive) violations.push("Formateur inactif");

  // 1. Les disponibilités récurrentes doivent couvrir chaque créneau du motif hebdo.
  for (const slot of pattern) {
    const covered = trainer.availabilities.some(
      (a) => a.weekday === slot.weekday && a.start <= slot.start && a.end >= slot.end,
    );
    if (!covered) {
      const jours = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
      violations.push(`Indisponible le ${jours[slot.weekday]} ${slot.start}–${slot.end}`);
    }
  }

  // 2. Absences chevauchant une séance.
  const absentDays = sessions.filter((s) =>
    trainer.absences.some((a) => dateInRange(s.localDate, a.startsOn, a.endsOn)),
  );
  if (absentDays.length > 0) {
    violations.push(
      `Absent sur ${absentDays.length} séance(s) (à partir du ${absentDays[0].localDate})`,
    );
  }

  // 3. Plafond hebdo : charge existante + nouvelles séances, semaine par semaine.
  const load = new Map<string, number>();
  for (const b of trainer.busy) {
    const week = weekStartOf(b.startsAt.slice(0, 10));
    load.set(week, (load.get(week) ?? 0) + intervalHours(b.startsAt, b.endsAt));
  }
  for (const s of sessions) {
    const week = weekStartOf(s.localDate);
    load.set(week, (load.get(week) ?? 0) + s.hours);
  }
  for (const [week, hours] of load) {
    if (hours > trainer.weeklyHoursMax + 1e-9) {
      violations.push(
        `Plafond hebdo dépassé semaine du ${week} (${round1(hours)} h > ${trainer.weeklyHoursMax} h)`,
      );
      break; // une seule mention suffit
    }
  }

  // 4. Conflit dur avec une séance existante.
  const conflict = sessions.find((s) =>
    trainer.busy.some((b) => overlaps(s.startsAt, s.endsAt, b.startsAt, b.endsAt)),
  );
  if (conflict) {
    violations.push(`Déjà en cours sur le créneau du ${conflict.localDate}`);
  }

  return violations;
}

// Notes SOUPLES (n'éliminent pas, pénalisent le score).
export function trainerSoftNotes(
  trainer: TrainerData,
  requiredSkills: string[],
  level: string | null,
  sessions: ProposedSession[],
): { notes: string[]; penalty: number; bonus: number } {
  const notes: string[] = [];
  let penalty = 0;
  let bonus = 0;

  for (const skill of requiredSkills) {
    if (!trainer.skills.includes(skill)) {
      notes.push(`Compétence « ${skill} » absente du profil`);
      penalty += 10;
    }
  }

  // Charge > 85 % du plafond après affectation : garder du mou.
  const load = new Map<string, number>();
  for (const b of trainer.busy) {
    const week = weekStartOf(b.startsAt.slice(0, 10));
    load.set(week, (load.get(week) ?? 0) + intervalHours(b.startsAt, b.endsAt));
  }
  for (const s of sessions) {
    const week = weekStartOf(s.localDate);
    load.set(week, (load.get(week) ?? 0) + s.hours);
  }
  const maxLoad = Math.max(0, ...load.values());
  if (trainer.weeklyHoursMax > 0 && maxLoad > 0.85 * trainer.weeklyHoursMax) {
    notes.push(
      `Charge élevée : ${round1(maxLoad)} h / ${trainer.weeklyHoursMax} h sur sa semaine la plus pleine`,
    );
    penalty += 5;
  }

  if (level && trainer.currentGroupLevels.includes(level)) {
    notes.push(`Continuité : anime déjà un groupe de niveau ${level}`);
    bonus += 3;
  }

  return { notes, penalty, bonus };
}

// Filtres durs d'une salle.
export function roomHardViolations(
  room: RoomData,
  sessions: ProposedSession[],
  expectedHeadcount?: number,
): string[] {
  const violations: string[] = [];

  if (!room.isActive) violations.push("Salle inactive");

  if (expectedHeadcount != null && room.capacity < expectedHeadcount) {
    violations.push(`Capacité insuffisante (${room.capacity} < ${expectedHeadcount})`);
  }

  const unavailable = sessions.find((s) =>
    room.unavailabilities.some((u) => dateInRange(s.localDate, u.startsOn, u.endsOn)),
  );
  if (unavailable) {
    violations.push(`Salle indisponible le ${unavailable.localDate}`);
  }

  const conflict = sessions.find((s) =>
    room.busy.some((b) => overlaps(s.startsAt, s.endsAt, b.startsAt, b.endsAt)),
  );
  if (conflict) {
    violations.push(`Salle déjà occupée le ${conflict.localDate}`);
  }

  return violations;
}

export function intervalHours(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Motif hebdo par défaut dérivé du rythme du dispositif :
// on remplit des matinées 9h-12h (lun→ven), puis des après-midis 13h30-16h30 si besoin.
export function defaultPattern(weeklyHours: number): SlotPattern[] {
  const pattern: SlotPattern[] = [];
  let remaining = weeklyHours;
  const weekdays: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
  for (const weekday of weekdays) {
    if (remaining <= 0) break;
    const hours = Math.min(3, remaining);
    pattern.push({ weekday, start: "09:00", end: addHoursToTimeLocal("09:00", hours) });
    remaining -= hours;
  }
  for (const weekday of weekdays) {
    if (remaining <= 0) break;
    const hours = Math.min(3, remaining);
    pattern.push({ weekday, start: "13:30", end: addHoursToTimeLocal("13:30", hours) });
    remaining -= hours;
  }
  return pattern;
}

function addHoursToTimeLocal(start: string, hours: number): string {
  const [sh, sm] = start.split(":").map(Number);
  const total = Math.round(sh * 60 + sm + hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function patternWeeklyHours(pattern: SlotPattern[]): number {
  return pattern.reduce((sum, slot) => sum + slotHours(slot.start, slot.end), 0);
}

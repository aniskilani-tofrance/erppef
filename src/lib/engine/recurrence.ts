import {
  addHoursToTime,
  dateInRange,
  isoWeekday,
  localToUtc,
  nextDay,
  slotHours,
} from "@/lib/dates";
import type { Closure, ProposedSession, SkippedDay, SlotPattern } from "./types";

// Garde-fous : un dispositif ne s'étale jamais sur plus de 18 mois ni 400 séances.
const MAX_DAYS = 550;
const MAX_SESSIONS = 400;

export type RecurrenceResult = {
  sessions: ProposedSession[];
  skipped: SkippedDay[];
  truncatedLast: boolean;
  exhausted: boolean; // true si le garde-fou a stoppé avant d'atteindre totalHours
};

// Matérialise toutes les séances d'un groupe : itération jour par jour en temps LOCAL,
// saut des fermetures (fériés, vacances, fermetures org), conversion locale → UTC à la fin.
export function generateSessions(opts: {
  pattern: SlotPattern[];
  startsOn: string;
  totalHours: number;
  closures: Closure[];
  tz: string;
}): RecurrenceResult {
  const { pattern, startsOn, totalHours, closures, tz } = opts;
  const sessions: ProposedSession[] = [];
  const skipped: SkippedDay[] = [];
  let remaining = totalHours;
  let truncatedLast = false;
  let date = startsOn;
  let days = 0;

  const slotsByWeekday = new Map<number, SlotPattern[]>();
  for (const slot of pattern) {
    const list = slotsByWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    slotsByWeekday.set(
      slot.weekday,
      list.sort((a, b) => a.start.localeCompare(b.start)),
    );
  }

  while (remaining > 1e-9 && days < MAX_DAYS && sessions.length < MAX_SESSIONS) {
    const slots = slotsByWeekday.get(isoWeekday(date));
    if (slots?.length) {
      const closure = closures.find((c) => dateInRange(date, c.startsOn, c.endsOn));
      if (closure) {
        skipped.push({ date, label: closure.label });
      } else {
        for (const slot of slots) {
          if (remaining <= 1e-9) break;
          const full = slotHours(slot.start, slot.end);
          const hours = Math.min(full, remaining);
          const end = hours < full ? addHoursToTime(slot.start, hours) : slot.end;
          if (hours < full) truncatedLast = true;
          sessions.push({
            startsAt: localToUtc(date, slot.start, tz),
            endsAt: localToUtc(date, end, tz),
            localDate: date,
            hours,
          });
          remaining -= hours;
        }
      }
    }
    date = nextDay(date);
    days += 1;
  }

  return { sessions, skipped, truncatedLast, exhausted: remaining > 1e-9 };
}

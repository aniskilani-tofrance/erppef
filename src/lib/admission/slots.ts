// Créneaux d'admission (« prise de rendez-vous » simple, façon Calendly) : à partir des
// plages hebdomadaires de l'organisme, des périodes bloquées, des jours fermés (fériés,
// fermetures de l'organisme) et des rendez-vous déjà prévus, liste les créneaux libres.
// Fichier pur (aucun accès réseau ni base) : utilisable côté serveur comme côté client.
// Le chargement des données vit dans src/lib/admission/slots-server.ts.
//
// Toutes les heures sont des heures de Paris : chaque créneau est construit avec
// localToUtc(date, heure), jamais par addition d'heures sur de l'UTC (heure d'été/hiver).

import { isoWeekday, localToUtc, nextDay, utcToLocalDate } from "@/lib/dates";

export type SlotRule = {
  weekday: number; // 1 = lundi … 7 = dimanche
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  slotMinutes: number;
  isActive?: boolean;
};

// Période bloquée (absence, réunion…) ou rendez-vous déjà pris : un intervalle ISO.
export type BusyRange = { startsAt: string; endsAt: string; status?: string | null };

export type FreeSlot = {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  date: string; // 'YYYY-MM-DD' (Paris)
  time: string; // 'HH:mm' (Paris)
  minutes: number;
};

export const SLOT_HORIZON_DAYS = 14;
export const SLOT_MIN_NOTICE_MINUTES = 120;
export const SLOT_DURATIONS = [15, 20, 30, 45, 60] as const;

// Réglage par défaut tant que l'organisme n'a rien enregistré : mardi et jeudi,
// 10h-12h et 14h-16h, créneaux de 30 min.
export const DEFAULT_SLOT_RULES: SlotRule[] = [2, 4].flatMap((weekday) => [
  { weekday, startTime: "10:00", endTime: "12:00", slotMinutes: 30, isActive: true },
  { weekday, startTime: "14:00", endTime: "16:00", slotMinutes: 30, isActive: true },
]);

export const WEEKDAYS = [
  { value: 1, label: "Lundi", short: "Lun." },
  { value: 2, label: "Mardi", short: "Mar." },
  { value: 3, label: "Mercredi", short: "Mer." },
  { value: 4, label: "Jeudi", short: "Jeu." },
  { value: 5, label: "Vendredi", short: "Ven." },
  { value: 6, label: "Samedi", short: "Sam." },
  { value: 7, label: "Dimanche", short: "Dim." },
] as const;

const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function overlapsMs(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type FreeSlotsOptions = {
  horizonDays?: number; // jours calendaires, aujourd'hui compris
  minNoticeMinutes?: number; // délai minimal entre maintenant et le début du créneau
  closedDates?: Iterable<string>; // 'YYYY-MM-DD' (fériés, fermetures de l'organisme)
};

// Créneaux libres, triés. Un créneau est exclu s'il commence avant maintenant + délai,
// tombe un jour fermé, chevauche une période bloquée ou un rendez-vous « prévu »
// (les rendez-vous annulés, honorés ou absents ne bloquent rien).
export function freeSlots(
  rules: SlotRule[],
  blocks: BusyRange[],
  appointments: BusyRange[],
  now: Date,
  options: FreeSlotsOptions = {},
): FreeSlot[] {
  const horizonDays = options.horizonDays ?? SLOT_HORIZON_DAYS;
  const notice = options.minNoticeMinutes ?? SLOT_MIN_NOTICE_MINUTES;
  const closed = new Set(options.closedDates ?? []);
  const earliest = now.getTime() + notice * 60_000;

  const busy = [
    ...blocks,
    ...appointments.filter((a) => !a.status || a.status === "prevu"),
  ].map((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)] as const);

  const active = rules.filter((r) => r.isActive !== false && r.slotMinutes > 0);
  const byStart = new Map<string, FreeSlot>();

  let date = utcToLocalDate(now.toISOString());
  for (let i = 0; i < horizonDays; i++, date = nextDay(date)) {
    if (closed.has(date)) continue;
    const weekday = isoWeekday(date);
    for (const rule of active) {
      if (rule.weekday !== weekday) continue;
      const end = toMinutes(rule.endTime);
      for (let t = toMinutes(rule.startTime); t + rule.slotMinutes <= end; t += rule.slotMinutes) {
        const time = toHhmm(t);
        const startsAt = localToUtc(date, time);
        const endsAt = localToUtc(date, toHhmm(t + rule.slotMinutes));
        const s = Date.parse(startsAt);
        const e = Date.parse(endsAt);
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => overlapsMs(s, e, bs, be))) continue;
        if (!byStart.has(startsAt)) byStart.set(startsAt, { startsAt, endsAt, date, time, minutes: rule.slotMinutes });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// Le créneau demandé (début + durée) fait-il partie des créneaux libres ?
export function isSlotFree(slots: FreeSlot[], startsAt: string, minutes: number): boolean {
  const s = Date.parse(startsAt);
  return slots.some((x) => Date.parse(x.startsAt) === s && x.minutes === minutes);
}

// Créneaux groupés par jour, dans l'ordre.
export function groupSlotsByDay(slots: FreeSlot[]): { date: string; label: string; slots: FreeSlot[] }[] {
  const groups: { date: string; label: string; slots: FreeSlot[] }[] = [];
  for (const s of slots) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.date) last.slots.push(s);
    else groups.push({ date: s.date, label: slotDayLabel(s.date), slots: [s] });
  }
  return groups;
}

// « Mar. 21 oct. »
export function slotDayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[isoWeekday(date) - 1].short} ${d} ${MONTHS_SHORT[m - 1]}`;
}

// « Mar. 21 · 10h00 »
export function slotLabel(slot: Pick<FreeSlot, "date" | "time">): string {
  const d = Number(slot.date.slice(8, 10));
  return `${WEEKDAYS[isoWeekday(slot.date) - 1].short} ${d} · ${slot.time.replace(":", "h")}`;
}

// Jours fermés à partir d'intervalles de dates inclusifs (calendar_closures).
export function expandClosedDates(ranges: { startsOn: string; endsOn: string }[], from: string, to: string): string[] {
  const out = new Set<string>();
  for (const r of ranges) {
    let d = r.startsOn < from ? from : r.startsOn;
    const last = r.endsOn > to ? to : r.endsOn;
    while (d <= last) {
      out.add(d);
      d = nextDay(d);
    }
  }
  return [...out].sort();
}

// Contrôle d'une plage saisie dans les réglages ; null si valide, sinon le message.
export function validateSlotRule(rule: Pick<SlotRule, "weekday" | "startTime" | "endTime" | "slotMinutes">): string | null {
  if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) return "Jour invalide";
  if (!/^\d{2}:\d{2}$/.test(rule.startTime) || !/^\d{2}:\d{2}$/.test(rule.endTime)) return "Heure invalide";
  const span = toMinutes(rule.endTime) - toMinutes(rule.startTime);
  if (span <= 0) return "L'heure de fin doit être après l'heure de début";
  if (span < rule.slotMinutes) return `Une plage doit durer au moins ${rule.slotMinutes} min`;
  return null;
}

// Demi-journées pour bloquer une période dans les réglages (heure de Paris).
export const BLOCK_PARTS = [
  { code: "journee", label: "Journée entière", start: "00:00", end: "23:59" },
  { code: "matin", label: "Matin", start: "00:00", end: "13:00" },
  { code: "apres_midi", label: "Après-midi", start: "13:00", end: "23:59" },
] as const;
export type BlockPart = (typeof BLOCK_PARTS)[number]["code"];

// Période bloquée du jour « from » au jour « to » (inclus), sur la partie de journée choisie.
// Matin ou après-midi sur plusieurs jours : un bloc par jour.
export function blockRanges(from: string, to: string, part: BlockPart): BusyRange[] {
  const p = BLOCK_PARTS.find((x) => x.code === part) ?? BLOCK_PARTS[0];
  if (part === "journee") return [{ startsAt: localToUtc(from, "00:00"), endsAt: localToUtc(nextDay(to), "00:00") }];
  const out: BusyRange[] = [];
  for (let d = from; d <= to; d = nextDay(d)) {
    out.push({ startsAt: localToUtc(d, p.start), endsAt: p.end === "23:59" ? localToUtc(nextDay(d), "00:00") : localToUtc(d, p.end) });
  }
  return out;
}

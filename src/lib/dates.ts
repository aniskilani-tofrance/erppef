import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

export const DEFAULT_TZ = "Europe/Paris";

// 'YYYY-MM-DD' + 'HH:mm' (heure locale tz) → ISO UTC.
// Toute la génération de récurrence passe par ici : jamais de +24h sur de l'UTC (DST).
export function localToUtc(date: string, time: string, tz: string = DEFAULT_TZ): string {
  return fromZonedTime(`${date}T${time}:00`, tz).toISOString();
}

export function utcToLocalDate(iso: string, tz: string = DEFAULT_TZ): string {
  return format(toZonedTime(new Date(iso), tz), "yyyy-MM-dd", { timeZone: tz });
}

export function utcToLocalTime(iso: string, tz: string = DEFAULT_TZ): string {
  return format(toZonedTime(new Date(iso), tz), "HH:mm", { timeZone: tz });
}

// Jour de semaine ISO (1 = lundi … 7 = dimanche) d'une date 'YYYY-MM-DD', sans piège de timezone.
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = dimanche
  return day === 0 ? 7 : day;
}

// Lendemain d'une date 'YYYY-MM-DD' (arithmétique calendaire pure, hors timezone).
export function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Lundi de la semaine ISO contenant la date locale donnée.
export function weekStartOf(date: string): string {
  const wd = isoWeekday(date);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (wd - 1));
  return d.toISOString().slice(0, 10);
}

// Durée en heures entre 'HH:mm' et 'HH:mm'.
export function slotHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh + em / 60 - (sh + sm / 60);
}

// end = start + hours (sur des 'HH:mm').
export function addHoursToTime(start: string, hours: number): string {
  const [sh, sm] = start.split(":").map(Number);
  const total = Math.round(sh * 60 + sm + hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd; // comparaison ISO lexicographique valide
}

export function dateInRange(date: string, startsOn: string, endsOn: string): boolean {
  return date >= startsOn && date <= endsOn;
}

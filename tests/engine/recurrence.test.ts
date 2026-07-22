import { describe, expect, it } from "vitest";
import { generateSessions } from "@/lib/engine/recurrence";
import { utcToLocalTime } from "@/lib/dates";
import type { Closure, SlotPattern } from "@/lib/engine/types";

const TZ = "Europe/Paris";

// 15 h/sem : 5 matinées 9h-12h
const PATTERN_15H: SlotPattern[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  start: "09:00",
  end: "12:00",
}));

const CLOSURES_2026: Closure[] = [
  { startsOn: "2026-04-04", endsOn: "2026-04-19", label: "Printemps 2026 (zone C)", kind: "vacances_scolaires" },
  { startsOn: "2026-04-06", endsOn: "2026-04-06", label: "Lundi de Pâques", kind: "jour_ferie" },
  { startsOn: "2026-05-01", endsOn: "2026-05-01", label: "Fête du Travail", kind: "jour_ferie" },
  { startsOn: "2026-05-08", endsOn: "2026-05-08", label: "Victoire 1945", kind: "jour_ferie" },
  { startsOn: "2026-05-14", endsOn: "2026-05-14", label: "Ascension", kind: "jour_ferie" },
  { startsOn: "2026-05-25", endsOn: "2026-05-25", label: "Lundi de Pentecôte", kind: "jour_ferie" },
  { startsOn: "2026-07-04", endsOn: "2026-08-31", label: "Été 2026 (zone C)", kind: "vacances_scolaires" },
];

describe("generateSessions", () => {
  it("saute les vacances de printemps zone C et les fériés de mai", () => {
    const r = generateSessions({
      pattern: PATTERN_15H,
      startsOn: "2026-04-06", // lundi, en plein milieu des vacances de printemps
      totalHours: 300,
      closures: CLOSURES_2026,
      tz: TZ,
    });

    // Aucune séance pendant les vacances ni les fériés
    const dates = r.sessions.map((s) => s.localDate);
    expect(dates.some((d) => d >= "2026-04-06" && d <= "2026-04-19")).toBe(false);
    expect(dates).not.toContain("2026-05-01");
    expect(dates).not.toContain("2026-05-08");
    expect(dates).not.toContain("2026-05-14");
    expect(dates).not.toContain("2026-05-25");

    // Première séance = lundi 20 avril (reprise)
    expect(dates[0]).toBe("2026-04-20");

    // Volume complet planifié : 300 h = 100 séances de 3 h
    expect(r.sessions).toHaveLength(100);
    expect(r.sessions.reduce((s, x) => s + x.hours, 0)).toBeCloseTo(300);
    expect(r.truncatedLast).toBe(false);
    expect(r.exhausted).toBe(false);

    // Les jours sautés sont tracés
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("garde 9h locale à travers le changement d'heure d'octobre (DST)", () => {
    const r = generateSessions({
      pattern: [{ weekday: 5, start: "09:00", end: "12:00" }], // vendredis
      startsOn: "2026-10-19",
      totalHours: 9, // 3 vendredis : 23/10 (été, UTC+2), 30/10 et 06/11 (hiver, UTC+1)
      closures: [],
      tz: TZ,
    });

    expect(r.sessions.map((s) => s.localDate)).toEqual([
      "2026-10-23",
      "2026-10-30",
      "2026-11-06",
    ]);
    // L'heure LOCALE reste 09:00 des deux côtés du DST (le 25/10/2026 à 3h)…
    for (const s of r.sessions) {
      expect(utcToLocalTime(s.startsAt, TZ)).toBe("09:00");
    }
    // …donc l'heure UTC change : 07:00Z avant, 08:00Z après.
    expect(r.sessions[0].startsAt).toContain("07:00:00");
    expect(r.sessions[1].startsAt).toContain("08:00:00");
  });

  it("tronque la dernière séance quand le volume n'est pas divisible", () => {
    const r = generateSessions({
      pattern: [{ weekday: 1, start: "09:00", end: "12:00" }],
      startsOn: "2026-01-05",
      totalHours: 7.5, // 3 h + 3 h + 1,5 h
      closures: [],
      tz: TZ,
    });

    expect(r.sessions).toHaveLength(3);
    expect(r.sessions[2].hours).toBeCloseTo(1.5);
    expect(utcToLocalTime(r.sessions[2].endsAt, TZ)).toBe("10:30");
    expect(r.truncatedLast).toBe(true);
  });

  it("s'arrête sur le garde-fou si le volume est inatteignable", () => {
    const r = generateSessions({
      pattern: [{ weekday: 1, start: "09:00", end: "10:00" }],
      startsOn: "2026-01-05",
      totalHours: 500, // 1 h/sem → impossible en 18 mois
      closures: [],
      tz: TZ,
    });
    expect(r.exhausted).toBe(true);
  });
});

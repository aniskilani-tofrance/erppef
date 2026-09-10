import { toZonedTime } from "date-fns-tz";

// Heures d'appel restauration (scripts §0) : on n'appelle JAMAIS pendant le service.
//   traditionnel / rapide : 9h30-11h30 et 14h30-17h30
//   collective            : 9h-11h et 14h-16h (les chefs gérants finissent tôt)
// Le week-end et le vendredi après-midi sont des périodes de rush : on évite.

export type CallWindow = {
  state: "ok" | "service" | "closed" | "weekend";
  title: string;
  detail: string;
  nextOpen: string | null; // « 14h30 », « demain 9h30 »
};

type Range = { from: number; to: number }; // minutes depuis minuit

const WINDOWS: Record<"standard" | "collective", Range[]> = {
  standard: [
    { from: 9 * 60 + 30, to: 11 * 60 + 30 },
    { from: 14 * 60 + 30, to: 17 * 60 + 30 },
  ],
  collective: [
    { from: 9 * 60, to: 11 * 60 },
    { from: 14 * 60, to: 16 * 60 },
  ],
};

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export function callWindow(now: Date, segment: "standard" | "collective" = "standard"): CallWindow {
  const local = toZonedTime(now, "Europe/Paris");
  const day = local.getDay(); // 0 = dimanche
  const minutes = local.getHours() * 60 + local.getMinutes();
  const ranges = WINDOWS[segment];

  if (day === 0 || day === 6) {
    return {
      state: "weekend",
      title: "Week-end : pas d'appels",
      detail: "Samedi et dimanche, c'est le rush. Préparez la liste de lundi : recherche des décideurs, emails, Sheet.",
      nextOpen: `lundi ${hm(ranges[0].from)}`,
    };
  }
  const current = ranges.find((r) => minutes >= r.from && minutes < r.to);
  if (current) {
    return {
      state: "ok",
      title: `Créneau d'appel jusqu'à ${hm(current.to)}`,
      detail:
        current.from < 12 * 60
          ? "Les patrons sont joignables avant la mise en place. Les « Nouveau » d'abord."
          : "La coupure : le meilleur créneau de la journée. Deux créneaux hors service à proposer.",
      nextOpen: null,
    };
  }
  const next = ranges.find((r) => minutes < r.from);
  if (minutes >= ranges[0].to && minutes < ranges[1].from) {
    return {
      state: "service",
      title: "Service du midi : pas d'appels",
      detail: "Emails, SMS, relances écrites, mise à jour des fiches, recherche des franchisés. On rappelle à la coupure.",
      nextOpen: hm(ranges[1].from),
    };
  }
  return {
    state: "closed",
    title: next ? `Pas encore l'heure : appels à partir de ${hm(next.from)}` : "Service du soir : pas d'appels",
    detail: next
      ? "Préparez les fiches du jour : 20 secondes sur Google Maps par restaurant."
      : "Après 17h30, les équipes sont en cuisine. Bilan du jour à envoyer à la direction.",
    nextOpen: next ? hm(next.from) : `demain ${hm(ranges[0].from)}`,
  };
}

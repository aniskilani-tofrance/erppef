import { isOpenProspect } from "@/lib/prospection/status";

// La file d'appels du jour : qui appeler, dans quel ordre.
//   1. les rappels promis (rappel prévu, barrage) dont la date est arrivée — les plus anciens d'abord ;
//   2. les jamais appelés — les ouvertures les plus récentes d'abord (besoin de recrutement frais) ;
//   3. les « pas joint » à réessayer — le moins d'essais d'abord.
// Un prospect déjà appelé aujourd'hui sort de la file (on réessaie un autre jour, à un autre
// créneau), sauf rappel promis pour aujourd'hui. Sans numéro, il passe en fin de file :
// on le cherche sur Google Maps avant d'appeler.

export type QueueProspect = {
  id: string;
  status: string;
  phone: string | null;
  attempts: number;
  last_call_at: string | null;
  callback_on: string | null;
  opened_on: string | null;
  company: string;
};

function parisDay(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : null;
}

export function isDue(p: QueueProspect, today: string): boolean {
  if (!isOpenProspect(p.status)) return false;
  if (p.callback_on && p.callback_on > today) return false;
  const promised = (p.status === "rappeler" || p.status === "barrage") && p.callback_on === today;
  if (!promised && parisDay(p.last_call_at) === today) return false;
  return true;
}

function tier(p: QueueProspect): number {
  if (p.status === "rappeler" || p.status === "barrage") return 0;
  if (p.status === "a_appeler") return 1;
  return 2;
}

export function callQueue<T extends QueueProspect>(prospects: T[], today: string): T[] {
  return prospects
    .filter((p) => isDue(p, today))
    .sort((a, b) => {
      const phoneA = a.phone ? 0 : 1;
      const phoneB = b.phone ? 0 : 1;
      if (phoneA !== phoneB) return phoneA - phoneB;
      const t = tier(a) - tier(b);
      if (t) return t;
      if (tier(a) === 0) return (a.callback_on ?? "").localeCompare(b.callback_on ?? "");
      if (tier(a) === 1) return (b.opened_on ?? "").localeCompare(a.opened_on ?? "") || a.company.localeCompare(b.company);
      return a.attempts - b.attempts || (a.last_call_at ?? "").localeCompare(b.last_call_at ?? "");
    });
}

export type ListStats = {
  total: number;
  due: number;
  called: number;
  reached: number;
  interested: number;
  closed: number;
};

// Joint = quelqu'un a décroché (barrage compris) ; on mesure la joignabilité de la liste.
export function listStats(
  prospects: QueueProspect[],
  today: string,
): ListStats {
  const reachedStatuses = new Set(["barrage", "rappeler", "interesse", "pas_de_besoin", "ne_plus_appeler"]);
  return {
    total: prospects.length,
    due: prospects.filter((p) => isDue(p, today)).length,
    called: prospects.filter((p) => p.attempts > 0).length,
    reached: prospects.filter((p) => reachedStatuses.has(p.status)).length,
    interested: prospects.filter((p) => p.status === "interesse").length,
    closed: prospects.filter((p) => !isOpenProspect(p.status)).length,
  };
}

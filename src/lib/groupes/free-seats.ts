// Places libérées → candidats compatibles. PUR : la page charge, ce module décide.
//   candidat = en liste d'attente ou évalué (pas encore inscrit), niveau compatible avec le
//   niveau d'entrée du groupe, et aucun chevauchement d'horaires avec ses groupes actuels.

export type Slot = { weekday: number; start: string; end: string };

// Même règle que l'assistant de création de groupe : « Alpha avancé » rejoint un groupe
// « Alpha », les niveaux CECRL se comparent à l'exact.
export function levelMatches(learnerLevel: string | null, entryLevel: string | null): boolean {
  if (!learnerLevel || !entryLevel) return false;
  if (learnerLevel === entryLevel) return true;
  return ["Pré-alpha", "Alpha", "Post-alpha"].includes(entryLevel) && learnerLevel.startsWith(entryLevel);
}

export function slotsOverlap(a: Slot[], b: Slot[]): boolean {
  return a.some((x) => b.some((y) => x.weekday === y.weekday && x.start < y.end && y.start < x.end));
}

export type SeatCandidate = {
  id: string;
  status: string | null;
  level: string | null;
  currentPatterns: Slot[][]; // motifs hebdo des groupes où la personne est déjà inscrite
};

export function freeSeats(capacity: number | null, enrolled: number): number {
  if (!capacity) return 0;
  return Math.max(0, capacity - enrolled);
}

export function matchSeatCandidates(group: { entryLevel: string | null; pattern: Slot[] }, candidates: SeatCandidate[]): SeatCandidate[] {
  return candidates.filter((c) => {
    if (c.status !== "liste_attente" && c.status !== "evalue") return false;
    if (!levelMatches(c.level, group.entryLevel)) return false;
    return !c.currentPatterns.some((p) => slotsOverlap(p, group.pattern));
  });
}

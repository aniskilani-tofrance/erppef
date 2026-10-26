// Banque complète du test : littératie (ordre fixe) + CECRL d'origine + items ajoutés le 15/10.

import { ITEMS_CECRL } from "./banque-cecrl.ts";
import { ITEMS_LITTERATIE } from "./banque-litteratie.ts";
import { ITEMS_NOUVEAUX } from "./banque-nouveaux.ts";
import type { Competence, Item, Niveau } from "./types.ts";
import { NIVEAUX } from "./types.ts";

/** À changer dès qu'un item est ajouté, retiré ou modifié : la version est gardée avec chaque passation. */
export const VERSION_BANQUE = "2026-10-15.1";

export { ITEMS_CECRL, ITEMS_LITTERATIE, ITEMS_NOUVEAUX };

export const BANQUE: Item[] = [...ITEMS_LITTERATIE, ...ITEMS_CECRL, ...ITEMS_NOUVEAUX];

const PAR_ID = new Map(BANQUE.map((q) => [q.id, q]));

export function item(id: number): Item | undefined {
  return PAR_ID.get(id);
}

/**
 * Items d'une compétence à un niveau, dans l'ordre où le parcours adaptatif les propose :
 * priorité explicite d'abord, puis les items qui mesurent la langue avant les items « savoir-être »,
 * puis l'identifiant.
 */
export function itemsDe(competence: Competence, niveau: Niveau): Item[] {
  return BANQUE
    .filter((q) => q.competence === competence && q.level === niveau)
    .sort((a, b) =>
      (a.priorite ?? 5) - (b.priorite ?? 5) ||
      Number(Boolean(a.savoirEtre)) - Number(Boolean(b.savoirEtre)) ||
      a.id - b.id);
}

/** Tableau compétence × niveau (nombre d'items). */
export function couverture(items: Item[] = BANQUE): Record<string, Record<Niveau, number>> {
  const t: Record<string, Record<Niveau, number>> = {};
  for (const c of ["CO", "CE", "PO", "PE", "LANGUE"]) t[c] = { A1: 0, A2: 0, B1: 0, B2: 0 };
  for (const q of items) {
    if (q.competence === "LITTERATIE") continue;
    if (NIVEAUX.includes(q.level as Niveau)) t[q.competence][q.level as Niveau] += 1;
  }
  return t;
}

// Version PUBLIQUE des items envoyée au navigateur : celle du module (itemPublic), plus la
// règle de l'ERP du 16/10 pour les items « à relier ». Le module garde les paires complètes
// (gauche + droite) : elles donneraient la réponse. Ici, colonne A seule et colonne B à part,
// triée (son ordre ne trahit aucune association). Adapté AUTOUR du module, pas dedans.

import { itemPublic, type Item } from "./module/index.ts";

export function itemPourNavigateur(q: Item): Item {
  const p = itemPublic(q);
  if (q.type === "match_pairs" && Array.isArray(q.pairs)) {
    const paires = q.pairs as { left: string; right: string }[];
    p.pairs = paires.map(({ left }) => ({ left }));
    p.rights = paires.map(({ right }) => right).sort((a, b) => a.localeCompare(b, "fr"));
  }
  return p;
}

export function itemsPourNavigateur(items: Item[]): Item[] {
  return items.map(itemPourNavigateur);
}

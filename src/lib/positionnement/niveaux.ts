// Correspondance entre le résultat du test ToFrance et les niveaux de l'ERP (LEVELS).
// Sans dépendance serveur : utilisée par la notation, la fiche apprenant et les tests.
//
// RÈGLE : un résultat qui ne tombe pas juste sur un niveau de l'ERP prend le niveau le plus
// PRUDENT (le plus bas qui reste vrai). Rien d'exploitable → « À évaluer avec un accompagnant »,
// comme l'ancien abandon à l'entraînement. Le détail exact (palier, compétences) reste dans
// placement_tests.answers.rapport et s'affiche sur la fiche.
//
// | Résultat ToFrance (rapport.global.niveau) | Niveau ERP                       |
// |-------------------------------------------|----------------------------------|
// | A1, A2, B1, B2 (règle « 3 sur 4 »)        | le même                          |
// | infra_A1 (« A1 non atteint »)             | A1.1 (lecture A1.1 acquise)      |
// | Pré-alpha, Alpha, Alpha avancé            | le même                          |
// | Post-alpha (A1.1 en cours)                | le même                          |
// | A1.1 acquis                               | A1.1                             |
// | Illettrisme probable                      | Alpha (+ repère sur la fiche)    |
// | non_evalue (abandon, aucune réponse)      | À évaluer avec un accompagnant   |
// Règle « fragile » (moins de 3 compétences) : le module donne déjà le plus bas des niveaux
// connus ; il suit la même table.
// Règles « litteratie » (arrêt au palier L0) et « palier_litteratie_oral » (L1 ou L2 raté, test
// continué, lecture A1 non atteinte) : le global est un PALIER de lecture, avec le niveau à
// l'oral à côté (global.niveauOral). La fiche reçoit le palier SEUL (valeur de LEVELS, décision
// d'Anis du 23/10) ; le libellé complet « Alpha avancé · oral B1 » (libelleGlobal du module) est
// dans le détail, la synthèse et le dossier d'entrée PDF (synthese.ts).

import type { LEVELS } from "@/lib/referentiels";

export type NiveauErp = (typeof LEVELS)[number];

export const A_EVALUER_ACCOMPAGNANT = "À évaluer avec un accompagnant";

export const CORRESPONDANCE_NIVEAUX: Record<string, NiveauErp | typeof A_EVALUER_ACCOMPAGNANT> = {
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  infra_A1: "A1.1",
  "Pré-alpha": "Pré-alpha",
  Alpha: "Alpha",
  "Alpha avancé": "Alpha avancé",
  "Post-alpha (A1.1 en cours)": "Post-alpha (A1.1 en cours)",
  "A1.1 acquis": "A1.1",
  "Illettrisme probable": "Alpha",
  non_evalue: A_EVALUER_ACCOMPAGNANT,
};

/** Niveau à écrire dans learners.level_assessed et placement_tests.level. */
export function niveauErp(global: { niveau: string } | null | undefined): NiveauErp | typeof A_EVALUER_ACCOMPAGNANT {
  return (global && CORRESPONDANCE_NIVEAUX[global.niveau]) || A_EVALUER_ACCOMPAGNANT;
}

type Corrige = { correct: boolean; poids: number };

/**
 * Score sur 100 = part des questions RÉUSSIES parmi les questions POSÉES (hors bloc « lire et
 * écrire »), pondérée comme le module (0,5 pour un item « savoir-être »).
 * Le test s'adapte : chacun reçoit des questions de son niveau, donc ce chiffre ne classe pas
 * les personnes entre elles (c'est le niveau qui compte). null quand il n'a pas de sens :
 * arrêt au bloc « lire et écrire » (le niveau est un palier), abandon, aucune question corrigée.
 */
export function scoreSur100(corriges: Corrige[], opts: { regle: string; abandon?: boolean }): number | null {
  if (opts.abandon || opts.regle === "litteratie" || opts.regle === "aucune") return null;
  const total = corriges.reduce((s, c) => s + c.poids, 0);
  if (!total) return null;
  const reussi = corriges.reduce((s, c) => s + (c.correct ? c.poids : 0), 0);
  return Math.round((reussi / total) * 100);
}

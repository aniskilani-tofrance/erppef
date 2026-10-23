// Libellés affichés (sans aucune donnée de correction : importables par le navigateur).

import type { ProfilType } from "./types.ts";

export const MENTION =
  "Test de positionnement : il situe votre niveau pour vous orienter. Ce n'est pas une certification " +
  "(DELF, DALF, TCF) et il ne remplace pas un diplôme ou un test officiel.";

export const LIBELLES_PROFIL: Record<ProfilType, string> = {
  oral_superieur_ecrit: "Oral plus avancé que l'écrit : vous parlez et comprenez mieux que vous ne lisez et écrivez.",
  ecrit_superieur_oral: "Écrit plus avancé que l'oral : vous lisez et écrivez mieux que vous ne parlez et comprenez à l'oral.",
  homogene: "Profil équilibré entre l'oral et l'écrit.",
  non_determine: "Profil à préciser avec un formateur.",
};

export function libelleNiveau(n: string): string {
  if (n === "infra_A1") return "A1 non atteint";
  if (n === "non_evalue") return "Non évalué";
  return n;
}

/**
 * Niveau global affiché : un niveau CECRL (« B1 »), ou un palier de lecture suivi du niveau à
 * l'oral quand il est connu (« Alpha avancé · oral B1 »).
 */
export function libelleGlobal(g: { niveau: string; niveauOral?: string | null }): string {
  const n = libelleNiveau(String(g.niveau));
  return g.niveauOral ? `${n} · oral ${libelleNiveau(g.niveauOral)}` : n;
}


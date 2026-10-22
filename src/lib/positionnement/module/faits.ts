// Faits du dossier issus d'un test de positionnement (source « test », valables 6 mois).
// Clés déclarées dans le dictionnaire du moteur (app/src/engine/faits.ts). Le moteur d'orientation
// ne les lit pas encore : voir la fiche de décision du 15/10 (« ce que le fait vérifié changera »).

import type { Competence4, Confiance, Rapport } from "./types.ts";

export const VALIDITE_JOURS = 180;

export interface FaitTest {
  cle: string;
  valeur: string | boolean;
  source: "test";
  /** 0 à 1. */
  confiance: number;
  valide_jours: number;
}

const POIDS: Record<Confiance, number> = { bonne: 0.9, moyenne: 0.75, faible: 0.5 };
const CLES: Record<Competence4, string> = {
  CO: "niveau_co_evalue", CE: "niveau_ce_evalue", PO: "niveau_po_evalue", PE: "niveau_pe_evalue",
};

export function faitsDuRapport(r: Rapport): FaitTest[] {
  const f = (cle: string, valeur: string | boolean, confiance: number): FaitTest =>
    ({ cle, valeur, source: "test", confiance: Math.round(confiance * 100) / 100, valide_jours: VALIDITE_JOURS });
  const out: FaitTest[] = [];
  if (r.global.niveau !== "non_evalue") {
    const confs = (["CO", "CE", "PO", "PE"] as Competence4[]).map((c) => POIDS[r.competences[c].confiance]);
    out.push(f("niveau_cecrl_evalue", String(r.global.niveau), Math.min(...confs) * (r.a_confirmer ? 0.9 : 1)));
    out.push(f("niveau_francais_verifie", true, 1));
  }
  for (const c of ["CO", "CE", "PO", "PE"] as Competence4[]) {
    const res = r.competences[c];
    if (res.niveau === "non_evalue") continue;
    // Production évaluée par IA ou repli : « à confirmer » → confiance réduite.
    out.push(f(CLES[c], res.niveau, POIDS[res.confiance] * (res.a_confirmer ? 0.8 : 1)));
  }
  if (r.litteratie.palier !== "non_evalue") out.push(f("litteratie_evaluee", r.litteratie.palier, 0.8));
  if (r.profil.type !== "non_determine") out.push(f("profil_francais", r.profil.type, 0.7));
  return out;
}

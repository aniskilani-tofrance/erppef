// Profil par compétence, niveau global et rapport.
//
// RÈGLE DU NIVEAU GLOBAL (décision du 15/10, à calibrer — voir la fiche de décision) :
//   le niveau global est le plus haut niveau atteint dans AU MOINS 3 des 4 compétences
//   (CO, CE, PO, PE). Autrement dit : on range les 4 niveaux du plus haut au plus bas et on prend
//   le 3e. Une compétence isolée plus forte (souvent l'oral) ne tire pas le global vers le haut,
//   une seule plus faible ne le tire pas vers le bas : elles apparaissent dans le PROFIL.
//   - 3 compétences évaluées : le plus bas des trois. Moins de 3 : pas de niveau global CECRL
//     (on donne le palier de littératie s'il y en a un, sinon le plus bas des niveaux connus, « fragile »).
//   - Arrêt au bloc littératie : le global est le palier de littératie (Alpha, Post-alpha…).
// PROFIL : « oral > écrit » quand la moyenne CO+PO dépasse d'au moins un niveau la moyenne CE+PE
//   (profil fréquent chez les personnes arrivées récemment ou peu scolarisées), et inversement.

import { jePeux } from "./descripteurs.ts";
import type { Trace, TraceCompetence } from "./parcours.ts";
import type {
  Competence, Competence4, Confiance, EvaluationLibre, ModeEvaluation, Niveau, NiveauResultat, ProfilType,
  Rapport, ResultatCompetence, ResultatLitteratie,
} from "./types.ts";
import { COMPETENCES_4, NIVEAUX } from "./types.ts";
import { recommandations } from "./recommandations.ts";
import { VERSION_BANQUE } from "./banque.ts";
import { LIBELLES_PROFIL, MENTION } from "./libelles.ts";

export { LIBELLES_PROFIL, MENTION, libelleNiveau } from "./libelles.ts";

const RANG: Record<string, number> = { infra_A1: 0, A1: 1, A2: 2, B1: 3, B2: 4 };
const DE_RANG: NiveauResultat[] = ["infra_A1", "A1", "A2", "B1", "B2"];

export function rangNiveau(n: NiveauResultat): number | null {
  return n === "non_evalue" ? null : RANG[n];
}

/** Indice de confiance d'une compétence : nombre d'items passés, abaissé pour un repli sans IA. */
export function confiance(itemsPasses: number, production: boolean, repli: boolean): Confiance {
  let c: Confiance;
  if (production) c = itemsPasses >= 2 ? "moyenne" : "faible";
  else c = itemsPasses >= 6 ? "bonne" : itemsPasses >= 3 ? "moyenne" : "faible";
  if (repli) c = "faible";
  return c;
}

/** Règle du niveau global (voir l'en-tête). Renvoie null quand moins de 3 compétences sont évaluées. */
export function niveauGlobal(niveaux: Record<Competence4, NiveauResultat>): NiveauResultat | null {
  const connus = COMPETENCES_4.map((c) => rangNiveau(niveaux[c])).filter((r): r is number => r !== null);
  if (connus.length < 3) return null;
  connus.sort((a, b) => b - a);
  return DE_RANG[connus[2]];
}

export function profilType(niveaux: Record<Competence4, NiveauResultat>, litteratieArret = false): ProfilType {
  const r = (c: Competence4) => rangNiveau(niveaux[c]);
  if (litteratieArret) return r("PO") !== null && (r("PO") as number) >= 1 ? "oral_superieur_ecrit" : "non_determine";
  const vals = [r("CO"), r("PO"), r("CE"), r("PE")];
  if (vals.some((v) => v === null)) return "non_determine";
  const oral = ((vals[0] as number) + (vals[1] as number)) / 2;
  const ecrit = ((vals[2] as number) + (vals[3] as number)) / 2;
  if (oral - ecrit >= 1) return "oral_superieur_ecrit";
  if (ecrit - oral >= 1) return "ecrit_superieur_oral";
  return "homogene";
}

function resultat(
  c: Competence, t: TraceCompetence | undefined, evaluations: Record<number, EvaluationLibre>,
): ResultatCompetence {
  if (!t) {
    return { competence: c, niveau: "non_evalue", parNiveau: {}, itemsPasses: 0, confiance: "faible", mode: "automatique", a_confirmer: false, jePeux: [] };
  }
  const parNiveau: ResultatCompetence["parNiveau"] = {};
  let passes = 0;
  const ids: number[] = [];
  for (const n of NIVEAUX) {
    const tn = t.niveaux[n];
    if (!tn) continue;
    parNiveau[n] = { reussis: tn.reussis, passes: tn.items.length };
    passes += tn.items.length;
    ids.push(...tn.items);
  }
  const production = c === "PO" || c === "PE";
  const evals = ids.map((id) => evaluations[id]).filter(Boolean);
  const repli = production && evals.some((e) => e.mode === "repli");
  const mode: ModeEvaluation = production ? (repli ? "repli" : "ia") : "automatique";
  return {
    competence: c,
    niveau: t.niveau,
    parNiveau,
    itemsPasses: passes,
    confiance: t.estime ? "faible" : confiance(passes, production, repli),
    mode,
    a_confirmer: production,
    jePeux: c === "LANGUE" || c === "LITTERATIE" ? [] : jePeux(c as Competence4, t.niveau),
  };
}

export interface EntreeRapport {
  trace: Trace;
  evaluations: Record<number, EvaluationLibre>;
  reponses: Record<number, string>;
  dureeSecondes: number;
  date?: string;
  /** Échec à l'entraînement de l'interface : aucun classement. */
  interfaceAbandon?: boolean;
}

export function construireRapport(e: EntreeRapport): Rapport {
  const { trace } = e;
  const competences = Object.fromEntries(
    COMPETENCES_4.map((c) => [c, resultat(c, trace.competences[c], e.evaluations)]),
  ) as Record<Competence4, ResultatCompetence>;
  const langue = resultat("LANGUE", trace.competences.LANGUE, e.evaluations);

  const scol = e.reponses[101] ?? "";
  const lit = trace.litteratie;
  const litteratie: ResultatLitteratie = {
    palier: lit.items.length === 0 ? "non_evalue" : lit.palier ?? "A1.1 acquis",
    oralDeBase: [103, 104, 105].some((id) => lit.items.includes(id))
      ? ["📞", "☕", "🐱"].filter((v, i) => e.reponses[103 + i] === v).length >= 2
      : null,
    scolarisation: scol.startsWith("🏫❌") ? "jamais" : scol.startsWith("🏫🎓") ? "longtemps" : scol.startsWith("🏫") ? "un_peu" : "inconnue",
    itemsPasses: lit.items.length,
  };

  const niveaux = Object.fromEntries(COMPETENCES_4.map((c) => [c, competences[c].niveau])) as Record<Competence4, NiveauResultat>;
  let global: Rapport["global"];
  if (e.interfaceAbandon) {
    global = { niveau: "non_evalue", regle: "aucune", explication: "Le test n'a pas pu être passé seul : à évaluer avec un accompagnant." };
  } else if (lit.arret) {
    global = {
      niveau: litteratie.palier,
      regle: "litteratie",
      explication: "Le test s'est arrêté au bloc « lire et écrire » : le niveau indiqué est le palier d'entrée dans l'écrit.",
    };
  } else {
    const g = niveauGlobal(niveaux);
    if (g) {
      global = { niveau: g, regle: "3_sur_4", explication: "Plus haut niveau atteint dans au moins 3 des 4 compétences." };
    } else {
      const connus = COMPETENCES_4.map((c) => rangNiveau(niveaux[c])).filter((r): r is number => r !== null);
      global = connus.length
        ? { niveau: DE_RANG[Math.min(...connus)], regle: "fragile", explication: "Moins de 3 compétences évaluées : niveau indicatif, fragile." }
        : { niveau: "non_evalue", regle: "aucune", explication: "Pas assez de réponses pour situer un niveau." };
    }
  }

  const type = e.interfaceAbandon ? "non_determine" : profilType(niveaux, lit.arret);
  const rapport: Rapport = {
    version: VERSION_BANQUE,
    date: e.date ?? new Date().toISOString(),
    dureeSecondes: e.dureeSecondes,
    competences,
    langue,
    litteratie,
    global,
    profil: { type, libelle: LIBELLES_PROFIL[type] },
    recommandations: [],
    a_confirmer: COMPETENCES_4.some((c) => competences[c].a_confirmer && competences[c].niveau !== "non_evalue"),
    mention: MENTION,
  };
  rapport.recommandations = e.interfaceAbandon
    ? ["Passer le test avec un accompagnant (conseillère, formateur ou bénévole), à l'oral."]
    : recommandations(rapport);
  return rapport;
}

export type { Niveau };

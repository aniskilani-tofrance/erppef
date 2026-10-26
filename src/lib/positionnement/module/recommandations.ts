// Recommandations NEUTRES : des TYPES de parcours, jamais un organisme, un centre ou une marque
// (charte de neutralité). Le choix d'un lieu se fait avec la conseillère.

import type { NiveauResultat, Rapport } from "./types.ts";

const R = {
  alpha: "Alphabétisation : apprendre à lire et à écrire en français, en petit groupe, à son rythme.",
  postAlpha: "Post-alphabétisation : consolider la lecture et l'écriture, puis entrer dans un cours de français A1.",
  savoirsBase: "Remise à niveau des savoirs de base (lecture, écriture, calcul) pour les personnes déjà scolarisées en français.",
  fleDebutant: "Cours de français débutant (A1) : se présenter, comprendre les situations de tous les jours.",
  flePro: "Français à visée professionnelle : le français du métier visé (consignes, sécurité, échanges avec les collègues et les clients).",
  formationAvecAppui: "Formation métier avec un appui en français (cours de français intégré ou en parallèle).",
  qualifiante: "Formation qualifiante ou recherche d'emploi directe : le français n'est plus un frein principal.",
  certification: "Si une démarche le demande (titre de séjour, naturalisation, inscription), préparer un diplôme ou un test officiel de français (DELF, TCF) : le conseiller ou la conseillère vérifie le niveau exigé.",
  ateliersEcrit: "Ateliers d'écrit ciblés (lire des documents, remplir des formulaires, écrire des messages), en plus de l'oral déjà solide.",
  ateliersOral: "Pratique de l'oral (conversation, mises en situation, téléphone), en plus de l'écrit déjà solide.",
  accompagnant: "Passer le test avec un formateur pour confirmer les résultats de l'oral et de l'écrit.",
};

/**
 * Lecture non acquise sans arrêt du test (décision du 23/10) : palier L1 ou L2 raté ET compréhension
 * écrite A1 non atteinte. Si la personne a réussi la compréhension écrite, ses réponses de lecture
 * priment sur le bloc « lire et écrire » (le palier reste dans le rapport, pour le formateur).
 * Sert à choisir la règle du niveau global (profil.ts). Renvoie la piste de lecture, ou null.
 */
export function lectureNonAcquise(palier: string, ce: NiveauResultat): "alpha" | "post_alpha" | null {
  if (!["Alpha", "Alpha avancé", "Post-alpha (A1.1 en cours)"].includes(palier)) return null;
  if (!["infra_A1", "non_evalue"].includes(ce)) return null;
  return palier === "Post-alpha (A1.1 en cours)" ? "post_alpha" : "alpha";
}

/**
 * Piste « lecture d'abord » d'un rapport dont le global est un palier de lecture sans arrêt du test
 * (règle « palier_litteratie_oral »). Renvoie la piste à mettre en premier, ou null.
 */
export function litteratieAConsolider(r: Rapport): "alpha" | "post_alpha" | null {
  if (r.global.regle !== "palier_litteratie_oral") return null;
  return r.litteratie.palier === "Post-alpha (A1.1 en cours)" ? "post_alpha" : "alpha";
}

export function recommandations(r: Rapport): string[] {
  const out: string[] = [];
  const p = r.litteratie.palier;
  if (r.global.regle === "litteratie") {
    if (p === "Illettrisme probable") out.push(R.savoirsBase);
    else if (p === "Post-alpha (A1.1 en cours)") out.push(R.postAlpha);
    else out.push(R.alpha);
    out.push(R.accompagnant);
    return out;
  }
  const lecture = litteratieAConsolider(r);
  if (lecture) {
    // Palier de lecture + oral (23/10) : la lecture d'abord ; un cours débutant si l'oral est faible.
    out.push(lecture === "post_alpha" ? R.postAlpha : R.alpha);
    const oral = r.global.niveauOral;
    if (!oral || ["infra_A1", "A1", "non_evalue"].includes(oral)) out.push(R.fleDebutant);
    out.push(R.accompagnant);
    return out;
  }
  switch (r.global.niveau) {
    case "infra_A1":
    case "A1":
      out.push(R.fleDebutant);
      break;
    case "A2":
      out.push(R.flePro, R.certification);
      break;
    case "B1":
      out.push(R.formationAvecAppui, R.certification);
      break;
    case "B2":
      out.push(R.qualifiante, R.certification);
      break;
    default:
      out.push(R.accompagnant);
  }
  if (r.profil.type === "oral_superieur_ecrit") out.push(R.ateliersEcrit);
  if (r.profil.type === "ecrit_superieur_oral") out.push(R.ateliersOral);
  if (r.a_confirmer && !out.includes(R.accompagnant)) out.push(R.accompagnant);
  return out;
}

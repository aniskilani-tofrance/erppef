// Recommandations NEUTRES : des TYPES de parcours, jamais un organisme, un centre ou une marque
// (charte de neutralité). Le choix d'un lieu se fait avec la conseillère.

import type { Rapport } from "./types.ts";

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

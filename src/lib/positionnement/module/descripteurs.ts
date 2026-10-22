// « Je peux… » : descripteurs du CECRL simplifiés (formulation propre, vie quotidienne et travail),
// par compétence et par niveau. Cumulatifs : un B1 peut aussi ce que décrit l'A2.

import type { Competence4, Niveau } from "./types.ts";

export const JE_PEUX: Record<Competence4, Record<Niveau, string[]>> = {
  CO: {
    A1: ["Je peux comprendre des mots et des phrases très simples si on parle lentement : un jour, une heure, une consigne courte."],
    A2: ["Je peux comprendre un message simple et clair : un rendez-vous, un changement d'horaire, une consigne de travail."],
    B1: ["Je peux comprendre l'essentiel d'un message ou d'une conversation sur le travail ou la vie quotidienne, si on parle clairement."],
    B2: ["Je peux comprendre une annonce, une réunion ou une explication un peu longue, et repérer les nuances et les changements."],
  },
  CE: {
    A1: ["Je peux lire un SMS, une affiche ou une offre d'emploi très courte et trouver une information simple."],
    A2: ["Je peux lire un avis, un courriel ou une consigne courte et comprendre ce qu'on me demande."],
    B1: ["Je peux lire un règlement, un courrier ou une lettre et comprendre les informations importantes."],
    B2: ["Je peux lire une note ou un texte assez long et comprendre le détail, les conditions et les exceptions."],
  },
  PO: {
    A1: ["Je peux me présenter et demander quelque chose de simple, avec des phrases courtes."],
    A2: ["Je peux décrire mon logement ou ma journée, prévenir d'une absence, raconter simplement ce que j'ai fait."],
    B1: ["Je peux raconter une expérience, expliquer mon travail et donner mon avis simplement."],
    B2: ["Je peux donner mon avis et le défendre avec des arguments et des exemples."],
  },
  PE: {
    A1: ["Je peux écrire quelques phrases simples sur moi et un message très court (SMS, mot au voisin)."],
    A2: ["Je peux écrire un message simple pour demander, prévenir ou m'excuser."],
    B1: ["Je peux écrire un courriel clair pour raconter, expliquer ou confirmer quelque chose."],
    B2: ["Je peux écrire un texte organisé pour donner mon avis avec des arguments."],
  },
};

/** Phrase pour une compétence dont le niveau A1 n'est pas encore atteint. */
export const EN_COURS: Record<Competence4, string> = {
  CO: "Je commence à reconnaître des mots du quotidien à l'oral.",
  CE: "Je commence à lire des mots et des informations très courtes.",
  PO: "Je commence à dire quelques mots en français.",
  PE: "Je commence à écrire quelques mots en français.",
};

export function jePeux(c: Competence4, niveau: string): string[] {
  const n = ["A1", "A2", "B1", "B2"].indexOf(niveau);
  if (n < 0) return niveau === "infra_A1" ? [EN_COURS[c]] : [];
  // Le niveau atteint, plus le niveau d'en dessous (ce qui est solide).
  const niv = ["A1", "A2", "B1", "B2"] as Niveau[];
  return [...(n > 0 ? JE_PEUX[c][niv[n - 1]] : []), ...JE_PEUX[c][niv[n]]];
}

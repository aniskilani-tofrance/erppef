// Version PUBLIQUE des items, envoyée au navigateur : sans bonnes réponses ni explications.
// (Correctif du 15/10 : l'outil d'origine laissait partir les réponses des formulaires, la
// justification attendue des vrai/faux et la catégorie de chaque mot à classer.)
// (Correctif du 23/10 : les items « à relier » envoyaient les paires complètes, donc la réponse.
// Le navigateur reçoit maintenant les deux colonnes séparées : `gauches` dans l'ordre de la banque,
// `droites` triées par ordre alphabétique, qui ne dépend que des mots et jamais de l'appariement.
// La réponse garde le même format { gauche: droite } ; la correction reste côté serveur.)

import type { Item } from "./types.ts";

const SECRETS = [
  "correct", "correctAnswer", "explanation", "acceptedAnswers", "correctBlanks", "correctSentence",
  "correctOrder", "criteria", "justification", "blank_answer", "priorite", "savoirEtre", "relecture", "auteur",
];

export function itemPublic(q: Item): Item {
  const copie: Item = { ...q };
  for (const s of SECRETS) delete copie[s];
  if (Array.isArray(q.formFields)) {
    copie.formFields = (q.formFields as { label: string; key: string }[]).map(({ label, key }) => ({ label, key }));
  }
  if (q.type === "categorize" && Array.isArray(q.items)) {
    copie.items = (q.items as { text: string }[]).map(({ text }) => ({ text }));
  }
  if (q.type === "match_pairs" && Array.isArray(q.pairs)) {
    const paires = q.pairs as { left: string; right: string }[];
    delete copie.pairs;
    copie.gauches = paires.map((p) => p.left);
    copie.droites = paires.map((p) => p.right).sort((a, b) => a.localeCompare(b, "fr"));
  }
  return copie;
}

export function itemsPublics(items: Item[]): Item[] {
  return items.map(itemPublic);
}

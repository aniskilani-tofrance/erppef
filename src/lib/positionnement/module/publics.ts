// Version PUBLIQUE des items, envoyée au navigateur : sans bonnes réponses ni explications.
// (Correctif du 15/10 : l'outil d'origine laissait partir les réponses des formulaires, la
// justification attendue des vrai/faux et la catégorie de chaque mot à classer.)

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
  return copie;
}

export function itemsPublics(items: Item[]): Item[] {
  return items.map(itemPublic);
}

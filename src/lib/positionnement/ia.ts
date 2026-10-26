// Correction des réponses libres du test de positionnement : le module reçoit sa fonction
// d'appel à l'IA (AppelIA). On la branche sur l'appel Mistral de l'ERP (grading.ts : même clé
// MISTRAL_API_KEY, même modèle). Sans clé → null : le module note avec son repli sans IA.
// Mistral en panne, 429 (quota), réponse illisible ou trop lente → le module bascule aussi sur
// le repli (« à confirmer par un formateur »). SERVEUR UNIQUEMENT.

import { appelMistral } from "@/lib/placement/grading";
import type { AppelIA } from "./module/index.ts";

/** Au-delà, on n'attend plus Mistral : la personne attend la question suivante. */
export const DELAI_IA_MS = 12_000;

export function appelIAPositionnement(): AppelIA | null {
  if (!process.env.MISTRAL_API_KEY) return null;
  return (messages) => appelMistral(messages, { timeoutMs: DELAI_IA_MS });
}

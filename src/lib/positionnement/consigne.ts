// Consigne générique dans la langue de la personne (module : consignes.ts, 10 langues).
// Tâche orale : au micro (reconnaissance vocale du navigateur), consigne « parler » du module ;
// en repli À L'ÉCRIT (pas de reconnaissance vocale, micro refusé, choix de la personne),
// consigne « écrire votre réponse ».
import { CONSIGNES, LANGUES, consigneTraduite, type Langue } from "./client";

export function consigneAffichee(q: { type: string; competence: string }, langue: string, oralParEcrit = false): string | null {
  if (q.type !== "oral" || !oralParEcrit) return consigneTraduite(q, langue);
  if (!langue || langue === "fr" || !(LANGUES as readonly string[]).includes(langue)) return null;
  return CONSIGNES.ecrire[langue as Langue];
}

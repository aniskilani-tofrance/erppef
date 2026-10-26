// Orchestration CÔTÉ SERVEUR : corriger, évaluer les productions en attente, avancer le parcours,
// construire le rapport. Aucun accès réseau ici : l'appel à l'IA est injecté (`appelIA`).

import { item } from "./banque.ts";
import { corrigerItemFerme } from "./correction.ts";
import { evaluerLibre, type AppelIA } from "./grille.ts";
import { deroulerParcours, type Etape, type Juge } from "./parcours.ts";
import { construireRapport } from "./profil.ts";
import { faitsDuRapport, type FaitTest } from "./faits.ts";
import type { EvaluationLibre, ItemCorrige, Rapport, Reponses } from "./types.ts";
import { TYPES_LIBRES } from "./types.ts";

export type Evaluations = Record<number, EvaluationLibre>;

export function creerJuge(rep: Reponses, evaluations: Evaluations): Juge {
  return (q) => {
    if (rep[q.id] == null) return undefined;
    if (TYPES_LIBRES.includes(q.type as never)) return evaluations[q.id]?.reussi;
    return corrigerItemFerme(q, rep[q.id]);
  };
}

/**
 * Avance le parcours. Les productions libres déjà répondues et demandées par le parcours sont
 * évaluées (IA ou repli) au passage ; seules celles-là : un client ne peut pas faire évaluer
 * d'autres textes. Renvoie la prochaine étape et les évaluations complétées.
 */
export async function avancer(
  rep: Reponses, evaluations: Evaluations, appelIA: AppelIA | null, prenom?: string,
): Promise<{ etape: Etape; evaluations: Evaluations }> {
  const ev: Evaluations = { ...evaluations };
  for (let tour = 0; tour < 20; tour++) {
    const etape = deroulerParcours(rep, creerJuge(rep, ev), prenom);
    const aEvaluer = etape.items.filter((id) => {
      const q = item(id);
      return q && TYPES_LIBRES.includes(q.type as never) && rep[id] != null && !ev[id];
    });
    if (!aEvaluer.length) return { etape, evaluations: ev };
    for (const id of aEvaluer) ev[id] = await evaluerLibre(item(id)!, rep[id], appelIA);
  }
  throw new Error("parcours : trop de tours");
}

export interface Bilan {
  rapport: Rapport;
  faits: FaitTest[];
  corriges: ItemCorrige[];
  evaluations: Evaluations;
}

/** Termine la passation : rapport, faits pour le dossier, détail corrigé (sans le prénom). */
export async function terminer(
  rep: Reponses, evaluations: Evaluations, appelIA: AppelIA | null,
  opts: { prenom?: string; dureeSecondes: number; interfaceAbandon?: boolean; date?: string },
): Promise<Bilan> {
  const { etape, evaluations: ev } = await avancer(rep, evaluations, appelIA, opts.prenom);
  const juge = creerJuge(rep, ev);
  const corriges: ItemCorrige[] = etape.trace.administres
    .map((id) => item(id)!)
    .filter((q) => q.competence !== "LITTERATIE" && rep[q.id] != null)
    .map((q) => ({
      itemId: q.id, competence: q.competence, niveau: q.level, correct: juge(q) === true,
      poids: q.savoirEtre ? 0.5 : 1, ...(ev[q.id] ? { evaluation: ev[q.id] } : {}),
    }));
  const rapport = construireRapport({
    trace: etape.trace, evaluations: ev, reponses: rep, dureeSecondes: opts.dureeSecondes,
    interfaceAbandon: opts.interfaceAbandon, date: opts.date,
  });
  return { rapport, faits: opts.interfaceAbandon ? [] : faitsDuRapport(rapport), corriges, evaluations: ev };
}

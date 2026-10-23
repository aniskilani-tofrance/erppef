// État du test de positionnement (version ToFrance), rangé SANS MIGRATION dans la colonne
// jsonb existante placement_tests.answers. Fonctions pures (serveur et tests).
//
// Pendant le test : status reste « en_attente » (seules valeurs permises : en_attente, fait) et
// answers = { modele, version_banque, langue, tour, reponses, evaluations… }.
// À la fin : status « fait », et answers garde tout + rapport, profil, niveau_erp, score.
// Les anciens tests gardent leur format (tableau de réponses corrigées) : lireEtat les ignore.

import type { Evaluations, ProfilType, Rapport, Reponses } from "./module/index.ts";
import { LANGUES } from "./module/consignes.ts";

export const MODELE = "positionnement-tofrance";

export interface EtatPositionnement {
  /** Repère du format (les anciens tests ont un tableau). */
  modele: typeof MODELE;
  version_banque: string;
  /** Langue des consignes (?lang=), « fr » par défaut. */
  langue: string;
  /** Incrémenté à chaque écriture : deux envois en même temps ne s'écrasent pas. */
  tour: number;
  commence_le: string;
  /** Temps passé, additionné bloc par bloc (survit à un rechargement de la page). */
  duree_secondes: number;
  reponses: Reponses;
  evaluations: Evaluations;
  // ── Fin du test ──
  termine_le?: string;
  interface_abandon?: boolean;
  rapport?: Rapport;
  profil?: { type: ProfilType; libelle: string };
  niveau_erp?: string;
  score?: number | null;
}

/** L'état v2 rangé dans answers, ou null (test neuf, ancien format, contenu illisible). */
export function lireEtat(answers: unknown): EtatPositionnement | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const a = answers as Partial<EtatPositionnement>;
  if (a.modele !== MODELE || typeof a.tour !== "number") return null;
  return {
    ...a,
    reponses: a.reponses && typeof a.reponses === "object" ? a.reponses : {},
    evaluations: a.evaluations && typeof a.evaluations === "object" ? a.evaluations : {},
    duree_secondes: Number(a.duree_secondes) || 0,
  } as EtatPositionnement;
}

/** Langue des consignes : une des 10 langues du module, sinon le français. */
export function langueValide(raw: unknown): string {
  return typeof raw === "string" && (LANGUES as readonly string[]).includes(raw) ? raw : "fr";
}

export function etatInitial(versionBanque: string, langue: string, maintenant: Date): EtatPositionnement {
  return {
    modele: MODELE,
    version_banque: versionBanque,
    langue: langueValide(langue),
    tour: 0,
    commence_le: maintenant.toISOString(),
    duree_secondes: 0,
    reponses: {},
    evaluations: {},
  };
}

/** Secondes déclarées par le navigateur pour un bloc : bornées (0 à 1 h par envoi). */
export function secondesBornees(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(3600, n)) : 0;
}

/** Durée totale bornée à 4 h (comme l'ancien test). */
export const DUREE_MAX = 4 * 3600;

/**
 * Prénom de l'item 108 (« Touchez votre prénom ») : on ne le garde pas dans le détail des
 * réponses (RGPD, comme l'ancien test). Appelé à la clôture seulement : la passation n'est plus
 * rejouée ensuite (le rapport est rangé).
 */
export function masquerPrenom(reponses: Reponses, prenom: string): Reponses {
  const r = { ...reponses };
  if (r[108] != null && r[108] !== "") {
    const n = (s: string) => s.toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "");
    r[108] = prenom && n(r[108]) === n(prenom) ? "(prénom reconnu)" : "(autre prénom)";
  }
  return r;
}

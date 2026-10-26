// Test de niveau dans la convocation à la réunion d'information : qui doit encore le faire,
// quel est SON lien, et la phrase ajoutée au message. Fonctions pures (client et serveur).
//
// Corrélation avec la bonne personne : un test (placement_tests) est créé POUR un apprenant
// (learner_id) et son lien porte un jeton unique. Le résultat remplit le niveau de CETTE fiche
// (learners.level_assessed, côté serveur à la correction) : le lien ne peut pas aller à une autre
// personne tant qu'il est choisi dans la liste des tests de cet apprenant, ce que fait pickConvocationTests.

import { buildTestUrl } from "@/lib/inscription/link";

// Adresse publique de l'ERP : le lien part dans un message WhatsApp ou un email, hors de l'ERP.
export const PUBLIC_ERP_URL = "https://pef-erp.vercel.app";

export type ConvocationLearner = { id: string; level_assessed: string | null };
export type ConvocationTestRow = { learner_id: string; status: string; token: string; created_at: string };

export type ConvocationTests = {
  /** learnerId → jeton de son test EN ATTENTE le plus récent (uniquement pour ceux qui doivent le faire). */
  pending: Map<string, string>;
  /** Ceux qui doivent faire le test mais n'ont encore aucun lien : à créer. */
  missing: string[];
  /** Ceux qui n'ont rien à faire : niveau déjà connu ou test déjà fait. */
  done: Set<string>;
};

/**
 * Qui doit faire le test : ni niveau connu (test fait, entretien oral retenu…), ni test déjà fait.
 * Les tests d'un autre usage (mi-parcours, finale) ne comptent pas : l'appelant ne passe que les
 * tests de positionnement.
 */
export function pickConvocationTests(
  learners: readonly ConvocationLearner[],
  tests: readonly ConvocationTestRow[],
): ConvocationTests {
  const byLearner = new Map<string, ConvocationTestRow[]>();
  for (const t of tests) byLearner.set(t.learner_id, [...(byLearner.get(t.learner_id) ?? []), t]);

  const pending = new Map<string, string>();
  const missing: string[] = [];
  const done = new Set<string>();
  for (const l of learners) {
    const mine = byLearner.get(l.id) ?? []; // seulement les tests de CET apprenant
    if (l.level_assessed || mine.some((t) => t.status === "fait")) {
      done.add(l.id);
      continue;
    }
    const latest = mine
      .filter((t) => t.status === "en_attente")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (latest) pending.set(l.id, latest.token);
    else missing.push(l.id);
  }
  return { pending, missing, done };
}

/** Lien du test ; hors français, ?lang= pour que les consignes s'ouvrent dans la langue de la personne. */
export function testLink(token: string, origin: string = PUBLIC_ERP_URL, locale: string = "fr"): string {
  return buildTestUrl(origin, token, locale);
}

/** Phrase de la convocation ({test_avant}) ; null si la personne n'a rien à faire. */
export function testBeforeSentence(url: string | null | undefined): string | null {
  const u = url?.trim();
  if (!u) return null;
  return `📝 Avant la réunion, faites votre test de niveau (entre 5 et 35 minutes, au calme, son au maximum). Ce n'est pas un examen :\n${u}`;
}

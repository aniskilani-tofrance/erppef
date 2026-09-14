import { QUESTIONS, gradeSubset, publicQuestionsById } from "@/lib/placement/grading";
import { CECRL_LEVELS, nextLevel, suggestLevel } from "@/lib/evaluations/grid";

// Test de mi-parcours / finale : un sous-ensemble ciblé de la banque du positionnement,
// au niveau visé du groupe et au niveau suivant (ex. groupe A1 → questions A1 + A2),
// une vingtaine de questions, sans le bloc littératie (les apprenants sont déjà en cours).

export const EVALUATION_TEST_SIZE = 20;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = any;

/** Niveau visé normalisé (« A1.1 » → « A1 », inconnu → « A1 »). */
export function normalizeTarget(level: string | null | undefined): string {
  const raw = (level ?? "").trim().toUpperCase().replace(/\.\d+$/, "");
  return (CECRL_LEVELS as readonly string[]).includes(raw) && raw !== "A1.1" ? raw : "A1";
}

/** Identifiants des questions retenues pour un niveau visé (ordre stable : niveau visé d'abord, puis id). */
export function evaluationQuestionIds(targetLevel: string | null | undefined): number[] {
  const target = normalizeTarget(targetLevel);
  const next = nextLevel(target);
  const pool = (QUESTIONS as Q[]).filter((q) => q.level === target || (next && q.level === next));
  // Équilibre : ~60 % au niveau visé, ~40 % au niveau suivant ; à l'intérieur d'un niveau, on
  // alterne les types pour couvrir écoute, lecture, écriture.
  const pick = (level: string, n: number) => {
    const byType = new Map<string, Q[]>();
    for (const q of pool.filter((x) => x.level === level).sort((a, b) => a.id - b.id)) {
      byType.set(q.type, [...(byType.get(q.type) ?? []), q]);
    }
    const out: Q[] = [];
    while (out.length < n && [...byType.values()].some((arr) => arr.length)) {
      for (const arr of byType.values()) {
        const q = arr.shift();
        if (q && out.length < n) out.push(q);
      }
    }
    return out;
  };
  const targetN = Math.min(Math.ceil(EVALUATION_TEST_SIZE * 0.6), pool.filter((q) => q.level === target).length);
  const chosen = [...pick(target, targetN), ...(next ? pick(next, EVALUATION_TEST_SIZE - targetN) : [])];
  return chosen.map((q) => q.id as number);
}

/** Questions (sans réponses) à envoyer au lecteur de test pour un niveau visé. */
export function evaluationQuestions(targetLevel: string | null | undefined): Q[] {
  return publicQuestionsById(evaluationQuestionIds(targetLevel));
}

/** Correction d'un test ciblé : score sur le sous-ensemble + niveau proposé. */
export async function gradeEvaluationTest(
  answersByQuestionId: Record<number, string>,
  targetLevel: string | null | undefined,
): Promise<{ score: number; level: string; answers: { questionId: number; answer: string; correct: boolean }[] }> {
  const target = normalizeTarget(targetLevel);
  const { score, answers } = await gradeSubset(answersByQuestionId, evaluationQuestionIds(target));
  return { score, level: suggestLevel(score, target), answers };
}

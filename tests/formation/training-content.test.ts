import { describe, expect, it } from "vitest";
import { TRAINING_MODULES } from "@/lib/training-content";

// Garde-fous de cohérence du contenu de formation : toute évolution du contenu
// repasse par ces vérifications.
describe("training-content", () => {
  it("identifiants de modules et de leçons uniques", () => {
    const moduleIds = TRAINING_MODULES.map((m) => m.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    for (const m of TRAINING_MODULES) {
      const lessonIds = m.lessons.map((l) => l.id);
      expect(new Set(lessonIds).size).toBe(lessonIds.length);
    }
  });

  it("chaque module a des objectifs, des leçons avec étapes, et un quiz", () => {
    for (const m of TRAINING_MODULES) {
      expect(m.objectives.length).toBeGreaterThan(0);
      expect(m.lessons.length).toBeGreaterThan(0);
      expect(m.quiz.length).toBeGreaterThanOrEqual(2);
      for (const l of m.lessons) expect(l.steps.length).toBeGreaterThan(0);
    }
  });

  it("chaque question a une réponse valide, des choix distincts et une explication", () => {
    for (const m of TRAINING_MODULES) {
      for (const q of m.quiz) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.choices.length);
        expect(q.explanation.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it("les bonnes réponses ne sont pas concentrées sur une seule position", () => {
    const positions = TRAINING_MODULES.flatMap((m) => m.quiz.map((q) => q.answerIndex));
    const counts = new Map<number, number>();
    for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
    // Aucune position ne doit porter plus de 50 % des bonnes réponses
    for (const [, count] of counts) {
      expect(count / positions.length).toBeLessThanOrEqual(0.5);
    }
  });

  it("les liens d'exercices pointent vers des routes internes", () => {
    for (const m of TRAINING_MODULES) {
      for (const l of m.lessons) {
        if (l.practice?.href) expect(l.practice.href.startsWith("/")).toBe(true);
      }
    }
  });
});

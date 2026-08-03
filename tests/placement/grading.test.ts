import { describe, expect, it } from "vitest";
import { FREE_RESPONSE_TYPES, QUESTIONS, gradeTest, publicQuestions } from "@/lib/placement/grading";

describe("test de positionnement — grading", () => {
  it("la banque contient les 56 questions avec ids uniques", () => {
    expect(QUESTIONS.length).toBe(56);
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("les questions publiques ne contiennent aucune réponse", () => {
    for (const q of publicQuestions()) {
      expect(q.correct).toBeUndefined();
      expect(q.acceptedAnswers).toBeUndefined();
      expect(q.correctBlanks).toBeUndefined();
      expect(q.correctSentence).toBeUndefined();
      expect(q.correctOrder).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });

  it("aucune réponse → score 0, niveau A1", async () => {
    const r = await gradeTest({});
    expect(r.score).toBe(0);
    expect(r.level).toBe("A1");
    expect(r.answers.length).toBe(QUESTIONS.length);
  });

  it("toutes les bonnes réponses (hors questions libres) → score et niveau élevés", async () => {
    const answers: Record<number, string> = {};
    for (const q of QUESTIONS) {
      if (FREE_RESPONSE_TYPES.includes(q.type)) {
        // fallback heuristique (pas de clé Mistral en test) : réponse assez longue
        answers[q.id] = "Bonjour, je vous confirme ma présence à la réunion de demain matin. Cordialement.";
      } else if (q.type === "match_pairs") {
        answers[q.id] = JSON.stringify(Object.fromEntries(q.pairs.map((p: { left: string; right: string }) => [p.left, p.right])));
      } else if (q.type === "categorize") {
        answers[q.id] = JSON.stringify(Object.fromEntries(q.items.map((i: { text: string; category: string }) => [i.text, i.category])));
      } else if (q.type === "order_sentences") {
        answers[q.id] = JSON.stringify(q.correctOrder.map((idx: number) => ({ origIdx: idx })));
      } else if (q.type === "sentence_builder") {
        answers[q.id] = q.correctSentence.split(" ").join("|");
      } else if (q.type === "fill_keyboard") {
        answers[q.id] = q.acceptedAnswers[0];
      } else if (q.type === "word_choice_text") {
        answers[q.id] = JSON.stringify(q.correctBlanks);
      } else if (q.type === "complete_form") {
        answers[q.id] = JSON.stringify(Object.fromEntries(q.formFields.map((f: { label: string }) => [f.label, "réponse"])));
      } else if (q.type === "true_false_justify") {
        answers[q.id] = JSON.stringify({ tf: q.correct, justif: "parce que le texte le dit clairement" });
      } else {
        answers[q.id] = typeof q.correct === "number" ? q.options[q.correct] : q.correct;
      }
    }
    const r = await gradeTest(answers);
    // Toutes les fermées justes ; les libres dépendent du fallback → score ≥ 80 attendu
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe("B2");
  });

  it("un QCM à réponse-index est corrigé par comparaison de texte", async () => {
    const q = QUESTIONS.find((x) => x.options && typeof x.correct === "number");
    if (!q) return; // aucune question de ce format dans la banque
    const r = await gradeTest({ [q.id]: q.options[q.correct] });
    expect(r.answers.find((a) => a.questionId === q.id)?.correct).toBe(true);
  });
});

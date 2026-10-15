import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  FREE_RESPONSE_TYPES,
  LITERACY_QUESTIONS,
  QUESTIONS,
  SECRET_FIELDS,
  gradeOne,
  gradeTest,
  publicQuestions,
} from "@/lib/placement/grading";
import { evaluationQuestions } from "@/lib/evaluations/questions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BANQUE: any[] = [...LITERACY_QUESTIONS, ...QUESTIONS];

// Parcourt récursivement un objet et renvoie toutes les clés rencontrées.
function toutesLesCles(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => toutesLesCles(x, acc));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      acc.add(k);
      toutesLesCles(x, acc);
    }
  }
  return acc;
}

describe("test de positionnement — ce qui part au navigateur", () => {
  const publiques = publicQuestions();

  it("aucun champ secret, à aucun niveau d'imbrication", () => {
    for (const q of publiques) {
      const cles = toutesLesCles(q);
      for (const f of [...SECRET_FIELDS, "answer", "category_answer"]) {
        expect(cles.has(f), `question ${q.id} : champ « ${f} » présent`).toBe(false);
      }
    }
  });

  it("les éléments à classer n'indiquent plus leur catégorie", () => {
    for (const q of publiques.filter((x) => x.type === "categorize")) {
      for (const item of q.items) expect(Object.keys(item)).toEqual(["text"]);
      expect(q.categories.length).toBeGreaterThan(0); // les catégories proposées restent
    }
  });

  it("les paires à relier ne sont plus envoyées toutes faites", () => {
    for (const q of publiques.filter((x) => x.type === "match_pairs")) {
      for (const p of q.pairs) expect(Object.keys(p)).toEqual(["left"]);
      const source = BANQUE.find((x) => x.id === q.id);
      // Colonne B complète mais triée : son ordre ne trahit pas les associations.
      expect([...q.rights].sort()).toEqual(source.pairs.map((p: any) => p.right).sort());
      expect(q.rights).toEqual([...q.rights].sort((a: string, b: string) => a.localeCompare(b, "fr")));
    }
  });

  it("les formulaires gardent étiquette et clé, sans la réponse attendue", () => {
    for (const q of publiques.filter((x) => x.formFields)) {
      for (const f of q.formFields) expect(Object.keys(f).sort()).toEqual(["key", "label"]);
    }
  });

  it("la valeur d'aucune réponse attendue n'apparaît hors des options proposées", () => {
    for (const q of publiques) {
      const source = BANQUE.find((x) => x.id === q.id);
      // (La justification d'un vrai/faux et les réponses d'un formulaire citent le texte lu :
      // elles sont couvertes par le test des clés.)
      const json = JSON.stringify({ ...q, options: undefined, textParts: undefined, words: undefined, sentences: undefined });
      const attendus = [source.correctAnswer, source.blank_answer, source.correctSentence]
        .filter((v) => typeof v === "string" && v.length > 3);
      for (const a of attendus) expect(json.includes(a), `question ${q.id} : « ${a} » visible`).toBe(false);
    }
  });

  it("ce qui sert à l'affichage est conservé (consigne, options, audio, textes)", () => {
    for (const q of publiques) {
      const source = BANQUE.find((x) => x.id === q.id);
      for (const k of ["id", "type", "level", "question", "options", "audioText", "passage", "statement", "dialogue",
        "template", "textParts", "words", "sentences", "categories", "context", "emailBody", "originalText", "stimulus"]) {
        expect(q[k]).toEqual(source[k]);
      }
    }
  });

  it("le test de mi-parcours / finale passe aussi par la version publique", () => {
    for (const niveau of ["A1", "A2", "B1"]) {
      for (const q of evaluationQuestions(niveau)) {
        const cles = toutesLesCles(q);
        for (const f of SECRET_FIELDS) expect(cles.has(f)).toBe(false);
        if (q.type === "categorize") for (const item of q.items) expect(item.category).toBeUndefined();
        if (q.type === "match_pairs") for (const p of q.pairs) expect(p.right).toBeUndefined();
      }
    }
  });

  it("aucun composant navigateur n'importe la banque complète ni la correction", () => {
    const dossier = path.resolve(__dirname, "../../src/components/placement");
    for (const f of readdirSync(dossier)) {
      const code = readFileSync(path.join(dossier, f), "utf8");
      expect(code, f).not.toMatch(/placement\/(questions|literacy-questions|grading)|evaluations\/questions/);
    }
  });
});

describe("test de positionnement — correction côté serveur", () => {
  it("à relier : juste si toutes les paires sont correctes, faux sinon", async () => {
    const q: any = QUESTIONS.find((x: any) => x.type === "match_pairs");
    const bon = Object.fromEntries(q.pairs.map((p: any) => [p.left, p.right]));
    expect(await gradeOne(q, JSON.stringify(bon))).toBe(true);
    const [a, b] = q.pairs;
    expect(await gradeOne(q, JSON.stringify({ ...bon, [a.left]: b.right, [b.left]: a.right }))).toBe(false);
  });

  it("à classer : une erreur de catégorie suffit à rendre faux", async () => {
    const q: any = QUESTIONS.find((x: any) => x.type === "categorize");
    const bon = Object.fromEntries(q.items.map((i: any) => [i.text, i.category]));
    expect(await gradeOne(q, JSON.stringify(bon))).toBe(true);
    const autre = q.categories.find((c: string) => c !== q.items[0].category);
    expect(await gradeOne(q, JSON.stringify({ ...bon, [q.items[0].text]: autre }))).toBe(false);
  });

  it("QCM : la bonne option est acceptée, une autre refusée", async () => {
    const q: any = QUESTIONS.find((x: any) => x.type === "listen_choose");
    const bonne = typeof q.correct === "number" ? q.options[q.correct] : q.correct;
    expect(await gradeOne(q, bonne)).toBe(true);
    expect(await gradeOne(q, q.options.find((o: string) => o !== bonne))).toBe(false);
  });

  it("vrai/faux : la bonne réponse sans justification ne suffit pas", async () => {
    const q: any = QUESTIONS.find((x: any) => x.type === "true_false_justify");
    expect(await gradeOne(q, JSON.stringify({ tf: q.correct, justif: "" }))).toBe(false);
    expect(await gradeOne(q, JSON.stringify({ tf: q.correct, justif: "le texte donne la date" }))).toBe(true);
  });

  it("des réponses vides ou fausses ne donnent pas de score, quoi que le client prétende", async () => {
    const answers: Record<number, string> = {};
    for (const q of QUESTIONS as any[]) if (!FREE_RESPONSE_TYPES.includes(q.type)) answers[q.id] = "réponse inventée";
    const r = await gradeTest(answers);
    expect(r.score).toBe(0);
    expect(r.level).toBe("A1");
  });
});

// Correction du test de positionnement, CÔTÉ SERVEUR (les bonnes réponses ne sont
// jamais envoyées au navigateur pour les QCM). Portée depuis l'app Base44 d'origine.
// Questions libres (écrit/oral/reformulation) : évaluation par Mistral, avec repli
// heuristique (nombre de mots) si l'API est indisponible.

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { questions as QUESTIONS_RAW } from "./questions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Question = any;

export const QUESTIONS: Question[] = QUESTIONS_RAW as Question[];

export const FREE_RESPONSE_TYPES = ["written", "oral", "reformulate"];

// Champs à ne JAMAIS envoyer au client (réponses et explications).
const SECRET_FIELDS = [
  "correct", "explanation", "acceptedAnswers", "correctBlanks",
  "correctSentence", "correctOrder", "criteria",
];

export function publicQuestions(): Question[] {
  return QUESTIONS.map((q) => {
    const copy: Question = { ...q };
    for (const f of SECRET_FIELDS) delete copy[f];
    // email_response est un QCM dans les données : ses options restent, sa réponse non.
    return copy;
  });
}

async function evaluateFreeAnswer(q: Question, answer: string): Promise<boolean> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return fallbackFree(q, answer);
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: `Tu es un évaluateur de français langue étrangère niveau ${q.level}.
Évalue cette réponse selon les critères suivants :
${(q.criteria ?? ["Réponse cohérente", "Français correct"]).map((c: string) => `- ${c}`).join("\n")}

Question : ${q.question}
${q.originalText ? `Phrase originale à reformuler : "${q.originalText}"` : ""}
Réponse de l'étudiant : "${answer}"

Évalue si la réponse respecte MAJORITAIREMENT les critères pour le niveau ${q.level}.
${q.type === "oral" ? "Note : il peut y avoir des erreurs de transcription vocale, sois indulgent sur l'orthographe." : ""}
Réponds en JSON : {"evaluation": "correct" | "incorrect", "explanation": "une phrase"}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return parsed.evaluation === "correct";
  } catch {
    return fallbackFree(q, answer);
  }
}

function fallbackFree(q: Question, answer: string): boolean {
  const wordCount = answer.split(/\s+/).filter((w) => w.length > 0).length;
  return wordCount >= (q.minWords ?? 3);
}

export type GradedAnswer = { questionId: number; answer: string; correct: boolean };
export type GradeResult = {
  score: number;
  level: "A1" | "A2" | "B1" | "B2";
  answers: GradedAnswer[];
};

// answersByQuestionId : réponse brute du client, indexée par id de question.
export async function gradeTest(answersByQuestionId: Record<number, string>): Promise<GradeResult> {
  let correctCount = 0;
  const details: GradedAnswer[] = [];

  for (const q of QUESTIONS) {
    const userAnswer = answersByQuestionId[q.id] ?? "";
    let isCorrect = false;

    try {
      if (FREE_RESPONSE_TYPES.includes(q.type)) {
        isCorrect = userAnswer.trim() ? await evaluateFreeAnswer(q, userAnswer) : false;
      } else if (q.type === "match_pairs") {
        const matched = userAnswer ? JSON.parse(userAnswer) : {};
        isCorrect = q.pairs.every((p: any) => matched[p.left] === p.right);
      } else if (q.type === "categorize") {
        const assigned = userAnswer ? JSON.parse(userAnswer) : {};
        isCorrect = q.items.every((item: any) => assigned[item.text] === item.category);
      } else if (q.type === "order_sentences") {
        const ordered = userAnswer ? JSON.parse(userAnswer) : [];
        isCorrect =
          ordered.length === q.sentences.length &&
          ordered.every((item: any, i: number) => item.origIdx === q.correctOrder[i]);
      } else if (q.type === "sentence_builder") {
        const built = userAnswer.split("|").join(" ").trim().toLowerCase().replace(/\.$/, "");
        isCorrect = built === q.correctSentence.toLowerCase().replace(/\.$/, "");
      } else if (q.type === "fill_keyboard") {
        const ans = userAnswer.trim().toLowerCase();
        isCorrect = q.acceptedAnswers.some((a: string) => a.toLowerCase() === ans);
      } else if (q.type === "word_choice_text") {
        const choices = userAnswer ? JSON.parse(userAnswer) : [];
        isCorrect = q.correctBlanks.every((ans: string, i: number) => choices[i] === ans);
      } else if (q.type === "complete_form") {
        const fields = userAnswer ? JSON.parse(userAnswer) : {};
        isCorrect = Object.keys(fields).length >= Math.ceil(q.formFields.length * 0.6);
      } else if (q.type === "true_false_justify") {
        const { tf, justif } = userAnswer ? JSON.parse(userAnswer) : { tf: null, justif: "" };
        isCorrect = tf === q.correct && Boolean(justif) && justif.trim().length > 3;
      } else {
        // QCM standard (listen_choose, fill_in_blank, scenario_tree, safety_instruction,
        // complete_dialogue, odd_one_out, read_comprehension, email_response).
        // Le client renvoie toujours le TEXTE de l'option choisie ; certaines données
        // stockent la bonne réponse comme index → normalisation ici.
        const correctText =
          q.options && typeof q.correct === "number" ? q.options[q.correct] : q.correct;
        isCorrect = userAnswer === correctText;
      }
    } catch {
      isCorrect = false;
    }

    if (isCorrect) correctCount++;
    details.push({ questionId: q.id, answer: userAnswer, correct: isCorrect });
  }

  const score = Math.round((correctCount / QUESTIONS.length) * 100);
  // Barème d'origine du test (A1 → B2), repris tel quel — le niveau reste modifiable
  // sur la fiche apprenant après entretien.
  let level: GradeResult["level"];
  if (score >= 80) level = "B2";
  else if (score >= 65) level = "B1";
  else if (score >= 45) level = "A2";
  else level = "A1";

  return { score, level, answers: details };
}

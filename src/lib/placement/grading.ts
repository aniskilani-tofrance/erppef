// Correction du test de positionnement, CÔTÉ SERVEUR (les bonnes réponses ne sont
// jamais envoyées au navigateur pour les QCM). Portée depuis l'app Base44 d'origine.
// Questions libres (écrit/oral/reformulation) : évaluation par Mistral, avec repli
// heuristique (nombre de mots) si l'API est indisponible.

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { questions as QUESTIONS_RAW } from "./questions";
import { literacyQuestions as LITERACY_RAW } from "./literacy-questions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Question = any;

export const QUESTIONS: Question[] = QUESTIONS_RAW as Question[];
export const LITERACY_QUESTIONS: Question[] = LITERACY_RAW as Question[];
const ALL_QUESTIONS: Question[] = [...LITERACY_QUESTIONS, ...QUESTIONS];

export const FREE_RESPONSE_TYPES = ["written", "oral", "reformulate"];

// Champs à ne JAMAIS envoyer au client (réponses et explications).
const SECRET_FIELDS = [
  "correct", "explanation", "acceptedAnswers", "correctBlanks",
  "correctSentence", "correctOrder", "criteria",
];

export function publicQuestions(): Question[] {
  return ALL_QUESTIONS.map((q) => {
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
  level: string; // Pré-alpha | Alpha | Alpha avancé | Post-alpha (A1.1 en cours) | A1.1 | A1 | A2 | B1 | B2 | flags
  answers: GradedAnswer[];
};

// ══════════════════════════════════════════════════════════════
// BLOC LITTÉRATIE — correction et routage (croisement oral/écrit,
// jamais un score unique ; cf. spec A1.1/DGLFLF, garde-fous ANLCI)
// ══════════════════════════════════════════════════════════════

// Correction d'un item littératie (tous synchrones : QCM tactiles + saisie chiffrée).
function gradeLiteracyItem(q: Question, answer: string, firstName?: string): boolean | null {
  if (q.skill === "declaratif") return null; // route la pédagogie, ne se note pas
  if (!answer) return false;
  if (q.dynamicName) {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-ZÀ-Ü-]/g, "");
    return Boolean(firstName) && norm(answer) === norm(firstName!);
  }
  if (q.type === "fill_keyboard") {
    return (q.acceptedAnswers ?? []).some((a: string) => a.trim() === answer.trim());
  }
  return answer === q.correct;
}

type LiteracySkills = {
  oral: number;    // /3 — OK si ≥ 2
  l0: number;      // /3 (entrée dans l'écrit)
  chiffres: number; // /1
  l1: number;      // /2 (déchiffrage)
  l2: number;      // /2 (lecture-compréhension = seuil A1.1)
  scolFaible: boolean;
  scolJamais: boolean;
  langScolFr: boolean;
};

function literacySkills(byId: Record<number, string>, firstName?: string): LiteracySkills {
  const ok = (id: number) => {
    const q = LITERACY_QUESTIONS.find((x) => x.id === id);
    return q && gradeLiteracyItem(q, byId[id] ?? "", firstName) === true ? 1 : 0;
  };
  const scol = byId[101] ?? "";
  return {
    oral: ok(103) + ok(104) + ok(105),
    l0: ok(106) + ok(107) + ok(108),
    chiffres: ok(109),
    l1: ok(110) + ok(111),
    l2: ok(112) + ok(113),
    scolJamais: scol.startsWith("🏫❌"),
    scolFaible: scol.startsWith("🏫❌") || (scol.startsWith("🏫 ") || scol.startsWith("🏫 Oui, un peu")),
    langScolFr: (byId[102] ?? "").startsWith("🇫🇷"),
  };
}

// Routage (spec §3). Retourne null si le profil déverrouille le test CECRL (sortie haute).
export function routeLiteracy(byId: Record<number, string>, firstName?: string): string | null {
  const s = literacySkills(byId, firstName);
  const oralOk = s.oral >= 2;

  if (s.l0 < 2) {
    if (!oralOk) return "Pré-alpha";
    if (s.langScolFr && !s.scolFaible) return "Illettrisme probable (orienter ANLCI)";
    return "Alpha";
  }
  if (s.l1 === 0) return "Alpha";
  if (s.l1 === 1 && s.l2 <= 1) return "Alpha avancé";
  if (s.l1 === 2 && s.l2 <= 1) return "Post-alpha (A1.1 en cours)";
  return null; // L2 = 2/2 : A1.1 écrit-réception acquis → suite du test
}

// Décisions d'arrêt anticipé côté serveur (les bonnes réponses ne quittent jamais le serveur).
// - stage "L0" (après l'item 109) : si l'entrée dans l'écrit échoue, on saute L1/L2/production.
// - stage "L1" (après l'item 111) : si le déchiffrage est nul, on saute L2/production.
// - stage "L2" (après l'item 113) : seul L2 = 2/2 ouvre le test CECRL complet.
export function literacyGateDecision(
  byId: Record<number, string>,
  stage: "L0" | "L1" | "L2",
  firstName?: string,
): { continue: boolean } {
  const s = literacySkills(byId, firstName);
  if (stage === "L0") return { continue: s.l0 >= 2 };
  if (stage === "L1") return { continue: s.l1 > 0 };
  return { continue: s.l2 === 2 };
}

export type GradeOptions = { firstName?: string };

// answersByQuestionId : réponse brute du client, indexée par id de question.
export async function gradeTest(
  answersByQuestionId: Record<number, string>,
  options: GradeOptions = {},
): Promise<GradeResult> {
  const details: GradedAnswer[] = [];

  // ── 1. Bloc littératie (présent dès qu'au moins un item 101+ a été administré) ──
  const literacyAnswered = LITERACY_QUESTIONS.some((q) => answersByQuestionId[q.id] != null);
  let literacyLevel: string | null = null;
  let literacyScore = 0;
  if (literacyAnswered) {
    let scorable = 0;
    let correct = 0;
    for (const q of LITERACY_QUESTIONS) {
      const answer = answersByQuestionId[q.id];
      if (answer == null) continue; // item non administré (arrêt anticipé ou skipIf)
      const isCorrect = gradeLiteracyItem(q, answer, options.firstName);
      // RGPD : le prénom (et ses distracteurs) ne se stocke pas dans le détail des réponses.
      details.push({
        questionId: q.id,
        answer: q.dynamicName ? (isCorrect ? "(prénom reconnu)" : "(distracteur)") : answer,
        correct: isCorrect === true,
      });
      if (isCorrect !== null && q.skill !== "ecriture") {
        scorable += 1;
        if (isCorrect) correct += 1;
      }
    }
    literacyLevel = routeLiteracy(answersByQuestionId, options.firstName);
    literacyScore = scorable > 0 ? Math.round((correct / scorable) * 100) : 0;
  }

  // Profil infra-A1 : le niveau vient du routage, le test CECRL n'a pas été passé.
  const cecrlAnswered = QUESTIONS.some((q) => answersByQuestionId[q.id] != null);
  if (literacyLevel !== null && !cecrlAnswered) {
    return { score: literacyScore, level: literacyLevel, answers: details };
  }

  // ── 2. Test CECRL (barème historique, calculé sur ses 56 questions) ──
  let correctCount = 0;

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

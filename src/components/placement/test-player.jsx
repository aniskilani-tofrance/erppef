"use client";

// Lecteur du test de positionnement (porté de l'app d'origine) :
// mélange des questions et options, minuteur par question, navigation,
// soumission au serveur qui corrige et attribue le niveau.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { literacyGate, submitTest } from "@/app/test/[token]/actions";
import { nameDistractors } from "@/lib/placement/literacy-questions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import QuestionCard, { speak } from "./question-card";
import { LiteracyTraining } from "./literacy-training";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Paliers du bloc littératie où le serveur décide de continuer ou d'arrêter
// (les bonnes réponses ne quittent jamais le serveur).
const GATE_AFTER = { 109: "L0", 111: "L1", 114: "L2" };

export function TestPlayer({ token, firstName, questions: rawQuestions }) {
  // Bloc littératie EN TÊTE et dans un ordre FIXE (progression pédagogique) ;
  // le test CECRL qui suit reste mélangé (anti-triche), options mélangées partout.
  const [questions] = useState(() => {
    const literacy = rawQuestions
      .filter((q) => q.block === "litteratie")
      .map((q) =>
        q.dynamicName
          ? { ...q, options: shuffle([(firstName || "").toUpperCase(), ...nameDistractors(firstName)]) }
          : q.options && !q.stimulus
            ? { ...q, options: shuffle(q.options) }
            : q,
      );
    const cecrl = shuffle(rawQuestions.filter((q) => q.block !== "litteratie")).map((q) =>
      q.options ? { ...q, options: shuffle(q.options) } : q,
    );
    return [...literacy, ...cecrl];
  });
  const hasLiteracy = questions.some((q) => q.block === "litteratie");

  const [started, setStarted] = useState(false);
  const [training, setTraining] = useState(false); // écrans E1/E2 (non notés)
  const [consent, setConsent] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> réponse (string)
  const [timeLeft, setTimeLeft] = useState(null);
  const [gating, setGating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const startTime = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const q = questions[current];

  // Sauts conditionnels du bloc littératie (ex. « langue de l'école » sans objet
  // pour quelqu'un qui n'y est jamais allé).
  function isSkipped(question, currentAnswers) {
    if (!question?.skipIf) return false;
    const ref = currentAnswers[question.skipIf.questionId] ?? "";
    return ref.startsWith(question.skipIf.answerStartsWith);
  }

  // Minuteur par question (null = sans limite) : à zéro, passage automatique.
  useEffect(() => {
    if (!started || result) return;
    setTimeLeft(q?.timeLimit ?? null);
  }, [current, started, q, result]);

  useEffect(() => {
    if (!started || result || timeLeft === null) return;
    if (timeLeft <= 0) {
      next();
      return;
    }
    const t = setTimeout(() => setTimeLeft((x) => (x === null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, started, result]);

  function select(value) {
    setAnswers((a) => ({ ...a, [q.id]: value }));
  }

  async function next() {
    // Palier littératie : le serveur décide (arrêt anticipé — on n'inflige pas
    // 56 questions écrites à quelqu'un qui n'est pas entré dans l'écrit).
    const stage = GATE_AFTER[q?.id];
    if (stage && !gating) {
      setGating(true);
      const gate = await literacyGate({ token, stage, answers: answersRef.current });
      setGating(false);
      if (gate.ok && !gate.continue) {
        handleSubmit();
        return;
      }
    }
    let i = current + 1;
    while (i < questions.length && isSkipped(questions[i], answersRef.current)) i += 1;
    if (i < questions.length) setCurrent(i);
    else handleSubmit();
  }

  function prev() {
    let i = current - 1;
    while (i >= 0 && isSkipped(questions[i], answersRef.current)) i -= 1;
    if (i >= 0) setCurrent(i);
  }

  async function handleSubmit(interfaceAbort = false) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const duration = Math.round((Date.now() - (startTime.current ?? Date.now())) / 1000);
    const res = await submitTest({
      token,
      durationSeconds: duration,
      answers: answersRef.current,
      interfaceAbort,
    });
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    setResult(res);
  }

  // ── Écran d'accueil ──
  if (!started) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- asset statique */}
          <img src="/logo-pef.png" alt="" className="mx-auto mb-3 h-16 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Bonjour {firstName} 👋
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ce test de français dure environ 30 minutes et permet à votre centre de
            formation de vous proposer le bon groupe. Il n&apos;y a rien à réviser :
            répondez naturellement.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <p>📝 {questions.length} questions : écoute, lecture, écriture.</p>
            <p>⏱️ Certaines questions ont un temps limité — il s&apos;affiche à l&apos;écran.</p>
            <p>🔊 Activez le son de votre appareil pour les questions d&apos;écoute.</p>
            <p>🤫 Répondez seul(e), sans traducteur : le résultat sert à VOUS aider.</p>
            <label className="flex items-start gap-2 pt-2">
              <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
              <span>
                J&apos;accepte que mes réponses soient enregistrées par ParlerEmploi
                Formation pour établir mon niveau de français.
              </span>
            </label>
          </CardContent>
        </Card>
        <Button
          size="lg"
          disabled={!consent}
          onClick={() => {
            startTime.current = Date.now();
            // Le clic est le geste utilisateur qui débloque la synthèse vocale (iOS/Safari).
            speak(hasLiteracy ? "Bonjour !" : "");
            if (hasLiteracy) setTraining(true);
            else setStarted(true);
          }}
        >
          Commencer le test
        </Button>
      </main>
    );
  }

  // ── Écran de résultat ──
  if (result) {
    // Sous A1 : jamais de niveau ni de score affiché au candidat (restitution
    // valorisante ; le détail va au formateur, à confirmer en entretien).
    const showLevel = ["A1", "A2", "B1", "B2"].includes(result.level);
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <h1 className="text-2xl font-semibold">Merci {firstName} ! C&apos;est terminé. 🎉</h1>
        {showLevel && (
          <p className="text-lg">
            Votre niveau : <span className="font-bold">{result.level}</span>
            <span className="ml-2 text-sm text-muted-foreground">({result.score} / 100)</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Votre centre de formation a reçu vos réponses et reviendra vers vous pour
          la suite de votre parcours. À bientôt !
        </p>
      </main>
    );
  }

  // ── Entraînement littératie (E1/E2, non noté) ──
  if (training) {
    return (
      <LiteracyTraining
        onDone={() => {
          setTraining(false);
          setStarted(true);
        }}
        onAbort={() => {
          setTraining(false);
          handleSubmit(true); // jamais de classement sur un échec d'interface
        }}
      />
    );
  }

  // ── Test en cours ──
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Question {current + 1} / {questions.length}</span>
          {timeLeft !== null && <span>⏱️ {timeLeft} s</span>}
        </div>
        <Progress value={((current + 1) / questions.length) * 100} />
      </div>

      <QuestionCard
        question={q}
        selectedAnswer={answers[q.id]}
        onSelect={select}
        questionNumber={current}
        timeLeft={timeLeft}
        onStartTimer={() => {}}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2 pb-8">
        <Button variant="outline" onClick={prev} disabled={current === 0 || submitting}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Précédent
        </Button>
        <Button onClick={next} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Correction en cours…
            </>
          ) : current === questions.length - 1 ? (
            "Terminer le test"
          ) : (
            <>
              Suivant
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </main>
  );
}

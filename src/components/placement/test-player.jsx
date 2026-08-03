"use client";

// Lecteur du test de positionnement (porté de l'app d'origine) :
// mélange des questions et options, minuteur par question, navigation,
// soumission au serveur qui corrige et attribue le niveau.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { submitTest } from "@/app/test/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import QuestionCard from "./question-card";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function TestPlayer({ token, firstName, questions: rawQuestions }) {
  // Anti-triche : ordre des questions et des options aléatoire par session.
  // (order_sentences mélange ses phrases lui-même dans le composant, avec origIdx.)
  const [questions] = useState(() =>
    shuffle(rawQuestions).map((q) => (q.options ? { ...q, options: shuffle(q.options) } : q)),
  );

  const [started, setStarted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> réponse (string)
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const startTime = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const q = questions[current];

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

  function next() {
    if (current < questions.length - 1) setCurrent((c) => c + 1);
    else handleSubmit();
  }

  function prev() {
    if (current > 0) setCurrent((c) => c - 1);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const res = await submitTest({
      token,
      durationSeconds: duration,
      answers: answersRef.current,
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
            setStarted(true);
          }}
        >
          Commencer le test
        </Button>
      </main>
    );
  }

  // ── Écran de résultat ──
  if (result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <h1 className="text-2xl font-semibold">Test terminé, merci {firstName} !</h1>
        <p className="text-lg">
          Votre niveau : <span className="font-bold">{result.level}</span>
          <span className="ml-2 text-sm text-muted-foreground">({result.score} / 100)</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Votre centre de formation a reçu votre résultat et reviendra vers vous pour
          la suite de votre parcours. Vous pouvez fermer cette page.
        </p>
      </main>
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

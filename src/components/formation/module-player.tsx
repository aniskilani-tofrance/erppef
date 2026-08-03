"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Lightbulb, Target, XCircle } from "lucide-react";
import type { QuizQuestion, TrainingModule } from "@/lib/training-content";
import { useTrainingProgress } from "@/lib/use-training-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ModulePlayer({ module: m }: { module: TrainingModule }) {
  const { ready, lessonDone, quizPassed, completeLesson, passQuiz } = useTrainingProgress();

  const doneCount = m.lessons.filter((l) => lessonDone(`${m.id}/${l.id}`)).length;
  const allLessonsDone = doneCount === m.lessons.length;
  const pct = Math.round(((doneCount + (quizPassed(m.id) ? 1 : 0)) / (m.lessons.length + 1)) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <Badge variant="outline">{m.duration}</Badge>
        {ready && quizPassed(m.id) && <Badge>Module validé ✓</Badge>}
        <Link href="/formation" className="ml-auto text-sm text-muted-foreground hover:underline">
          ← Tous les modules
        </Link>
      </div>

      <Progress value={ready ? pct : 0} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            À la fin de ce module, vous saurez…
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {m.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {m.lessons.map((lesson, i) => {
        const key = `${m.id}/${lesson.id}`;
        const done = ready && lessonDone(key);
        return (
          <Card key={lesson.id} className={done ? "border-primary/40" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                {lesson.title}
              </CardTitle>
              {lesson.intro && <p className="text-sm text-muted-foreground">{lesson.intro}</p>}
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {lesson.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
              {lesson.tip && (
                <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{lesson.tip}</span>
                </p>
              )}
              {lesson.practice && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3 text-sm">
                  <p className="font-medium">🎯 À vous de jouer</p>
                  <p className="mt-1 text-muted-foreground">{lesson.practice.instruction}</p>
                  {lesson.practice.href && (
                    <Link
                      href={lesson.practice.href}
                      target="_blank"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {lesson.practice.hrefLabel ?? "Ouvrir la page"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              )}
              {!done && (
                <Button size="sm" onClick={() => completeLesson(key)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  J&apos;ai lu et compris cette leçon
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <QuizCard
        module={m}
        locked={!allLessonsDone}
        passed={ready && quizPassed(m.id)}
        onPass={() => passQuiz(m.id)}
      />
    </div>
  );
}

function QuizCard({
  module: m,
  locked,
  passed,
  onPass,
}: {
  module: TrainingModule;
  locked: boolean;
  passed: boolean;
  onPass: () => void;
}) {
  // answers[i] = index choisi ; validated = correction affichée
  const [answers, setAnswers] = useState<(number | null)[]>(m.quiz.map(() => null));
  const [validated, setValidated] = useState(false);

  const score = m.quiz.filter((q, i) => answers[i] === q.answerIndex).length;
  const allAnswered = answers.every((a) => a !== null);
  const success = score === m.quiz.length;

  function validate() {
    setValidated(true);
    if (m.quiz.every((q, i) => answers[i] === q.answerIndex)) onPass();
  }

  function retry() {
    setAnswers(m.quiz.map(() => null));
    setValidated(false);
  }

  return (
    <Card className={passed ? "border-primary/40" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">
          Quiz de validation {passed && <Badge className="ml-2">Réussi ✓</Badge>}
        </CardTitle>
        {locked && !passed && (
          <p className="text-sm text-muted-foreground">
            Terminez d&apos;abord toutes les leçons ci-dessus pour débloquer le quiz.
          </p>
        )}
      </CardHeader>
      {(!locked || passed) && (
        <CardContent className="space-y-6">
          {m.quiz.map((q, i) => (
            <QuizQuestionBlock
              key={i}
              q={q}
              index={i}
              chosen={answers[i]}
              validated={validated || passed}
              onChoose={(choice) =>
                !validated && setAnswers((a) => a.map((x, j) => (j === i ? choice : x)))
              }
            />
          ))}

          {!passed && !validated && (
            <Button onClick={validate} disabled={!allAnswered}>
              Valider mes réponses
            </Button>
          )}
          {!passed && validated && (
            <div className="space-y-3">
              <p className={`text-sm font-medium ${success ? "text-primary" : "text-destructive"}`}>
                {success
                  ? `Sans faute (${score}/${m.quiz.length}) — module validé ! 🎉`
                  : `${score}/${m.quiz.length} bonne${score > 1 ? "s" : ""} réponse${score > 1 ? "s" : ""}. Relisez les explications puis réessayez.`}
              </p>
              {success ? (
                <Button asChild>
                  <Link href="/formation">Continuer le parcours →</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={retry}>
                  Réessayer le quiz
                </Button>
              )}
            </div>
          )}
          {passed && (
            <Button asChild variant="outline">
              <Link href="/formation">Retour au parcours →</Link>
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function QuizQuestionBlock({
  q,
  index,
  chosen,
  validated,
  onChoose,
}: {
  q: QuizQuestion;
  index: number;
  chosen: number | null;
  validated: boolean;
  onChoose: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {index + 1}. {q.question}
      </p>
      <div className="space-y-1.5">
        {q.choices.map((choice, i) => {
          const isChosen = chosen === i;
          const isAnswer = q.answerIndex === i;
          let style = "border hover:bg-muted";
          if (validated && isAnswer) style = "border-primary bg-primary/10";
          else if (validated && isChosen && !isAnswer) style = "border-destructive bg-destructive/10";
          else if (isChosen) style = "border-primary bg-accent";
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChoose(i)}
              disabled={validated}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${style}`}
            >
              {validated && isAnswer && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
              {validated && isChosen && !isAnswer && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
              {choice}
            </button>
          );
        })}
      </div>
      {validated && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{q.explanation}</p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { CheckCircle2, GraduationCap } from "lucide-react";
import type { AppRole } from "@/lib/auth";
import { TRACKS, TRAINING_MODULES } from "@/lib/training-content";
import { useTrainingProgress } from "@/lib/use-training-progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Accueil de la formation : les parcours visibles selon le rôle, avec progression.
export function TrainingHub({ role }: { role: AppRole }) {
  const { ready, lessonDone, quizPassed } = useTrainingProgress();

  const tracks = TRACKS.filter((t) => (t.roles as readonly string[]).includes(role));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Des modules courts, un exercice réel à chaque étape, un quiz pour valider.
          Votre progression est enregistrée sur cet appareil — reprenez quand vous voulez.
        </p>
      </div>

      {tracks.map((track) => {
        const modules = TRAINING_MODULES
          .filter((m) => m.track === track.id)
          .sort((a, b) => a.order - b.order);
        const totalSteps = modules.reduce((s, m) => s + m.lessons.length + 1, 0);
        const doneSteps = ready
          ? modules.reduce(
              (s, m) =>
                s +
                m.lessons.filter((l) => lessonDone(`${m.id}/${l.id}`)).length +
                (quizPassed(m.id) ? 1 : 0),
              0,
            )
          : 0;
        const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

        return (
          <Card key={track.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-5 w-5 text-primary" />
                {track.label}
                {pct === 100 && <Badge>Terminé 🎉</Badge>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{track.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progression</span>
                  <span>{pct} %</span>
                </div>
                <Progress value={pct} />
              </div>
              <ol className="space-y-2">
                {modules.map((m) => {
                  const lessonsDone = m.lessons.filter((l) => lessonDone(`${m.id}/${l.id}`)).length;
                  const complete = lessonsDone === m.lessons.length && quizPassed(m.id);
                  return (
                    <li key={m.id}>
                      <Link
                        href={`/formation/${m.id}`}
                        className="flex items-center gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted"
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                            complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {complete ? <CheckCircle2 className="h-4 w-4" /> : m.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{m.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {m.lessons.length} leçon{m.lessons.length > 1 ? "s" : ""} + quiz · {m.duration}
                            {ready && !complete && lessonsDone > 0 ? ` · ${lessonsDone}/${m.lessons.length} leçons faites` : ""}
                          </span>
                        </span>
                        <span className="text-sm text-muted-foreground">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Pour la référence complète au quotidien, voyez aussi la page{" "}
        <Link href="/aide" className="hover:underline">Aide</Link> et son manuel imprimable.
      </p>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { submitSurvey } from "@/app/enquete/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const QUESTIONS = [
  { key: "overall", label: "Globalement, êtes-vous satisfait(e) de la formation ?", required: true },
  { key: "teaching", label: "La qualité des cours et du formateur", required: false },
  { key: "organization", label: "L'organisation et les horaires", required: false },
  { key: "premises", label: "Les salles et le matériel", required: false },
  { key: "progress", label: "Votre progression en français", required: false },
] as const;

type QuestionKey = (typeof QUESTIONS)[number]["key"];

export function SurveyForm({ token }: { token: string }) {
  const [notes, setNotes] = useState<Record<QuestionKey, number | null>>({
    overall: null, teaching: null, organization: null, premises: null, progress: null,
  });
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!notes.overall) {
      setError("Répondez au moins à la première question.");
      return;
    }
    startTransition(async () => {
      const result = await submitSurvey({
        token,
        overall: notes.overall!,
        teaching: notes.teaching,
        organization: notes.organization,
        premises: notes.premises,
        progress: notes.progress,
        comment: comment || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-lg font-medium">Merci pour votre réponse !</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Elle nous aide à améliorer nos formations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="space-y-2">
            <Label>
              {q.label}
              {!q.required && <span className="ml-1 text-xs text-muted-foreground">(optionnel)</span>}
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} sur 5`}
                  className="p-1"
                  onClick={() => setNotes((s) => ({ ...s, [q.key]: s[q.key] === n ? null : n }))}
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      (notes[q.key] ?? 0) >= n
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/40",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <Label>Un commentaire ? (optionnel)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" size="lg" onClick={submit} disabled={pending}>
          {pending ? "Envoi…" : "Envoyer mes réponses"}
        </Button>
      </CardContent>
    </Card>
  );
}

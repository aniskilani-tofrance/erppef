"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { applyNoteActions, interpretNote, type ProposedAction } from "@/app/(app)/assistant/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// « Dire ce qui s'est passé » : une note libre → des actions proposées, cochées, enregistrées.
// Rien n'est écrit tant que la coordinatrice n'a pas cliqué « Enregistrer ».
export function NoteBox() {
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const executable = (a: ProposedAction) =>
    a.type !== "non_compris" &&
    (a.type === "absence_formatrice" ? Boolean(a.trainerId && a.starts_on) : a.type === "rappel" ? Boolean(a.starts_on && a.text) : Boolean(a.learnerId));

  function analyse() {
    startTransition(async () => {
      const r = await interpretNote(note);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSummary(r.summary);
      setActions(r.actions);
      setChecked(new Set(r.actions.map((a, i) => (executable(a) && a.confidence !== "basse" ? i : -1)).filter((i) => i >= 0)));
    });
  }

  function save() {
    const selected = actions.filter((_, i) => checked.has(i) && executable(actions[i]));
    if (!selected.length) return;
    startTransition(async () => {
      const r = await applyNoteActions(
        selected.map((a) => ({
          type: a.type as Exclude<ProposedAction["type"], "non_compris">,
          label: a.label, learnerId: a.learnerId, trainerId: a.trainerId, phone: a.phone, status: a.status, outcome: a.outcome,
          note: a.note, starts_on: a.starts_on, ends_on: a.ends_on, kind: a.kind, due_time: a.due_time, text: a.text,
        })),
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const ok = r.results.filter((x) => x.ok).length;
      const ko = r.results.filter((x) => !x.ok);
      if (ok) toast.success(`${ok} action${ok > 1 ? "s" : ""} enregistrée${ok > 1 ? "s" : ""}.`);
      for (const k of ko) toast.error(`${k.label} : ${k.error}`, { duration: 8000 });
      setNote(""); setSummary(null); setActions([]); setChecked(new Set());
      router.refresh();
    });
  }

  const confidenceClass = (c: ProposedAction["confidence"]) =>
    c === "haute" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : c === "moyenne" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-red-300 bg-red-50 text-red-700";

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Dire ce qui s&apos;est passé
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tapez les faits de la journée, l&apos;assistant propose les actions ; vous cochez, puis « Enregistrer ». Rien n&apos;est écrit avant.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Fatima vient jeudi à la réunion. Ali a changé de numéro : 06 12 34 56 78. Sabrina malade vendredi. Rappeler Amina lundi après 17h."
        />
        {actions.length === 0 ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={analyse} disabled={pending || note.trim().length < 3}>
              {pending ? "Analyse…" : "Analyser"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
            <ul className="divide-y rounded-md border">
              {actions.map((a, i) => {
                const can = executable(a);
                return (
                  <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <Checkbox checked={checked.has(i)} disabled={!can || pending} onCheckedChange={(v) => setChecked((prev) => { const n = new Set(prev); if (v === true) n.add(i); else n.delete(i); return n; })} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      {a.label}
                      {a.learnerName && <span className="ml-1 text-xs text-muted-foreground">({a.learnerName})</span>}
                      {!can && a.type !== "non_compris" && <span className="block text-xs text-red-700">Personne ou date non reconnue : à faire à la main.</span>}
                      {a.type === "non_compris" && <span className="block text-xs text-muted-foreground">Non compris : {a.text}</span>}
                    </span>
                    <Badge variant="outline" className={confidenceClass(a.confidence)}>{a.confidence}</Badge>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setActions([]); setSummary(null); setChecked(new Set()); }} disabled={pending}>Annuler</Button>
              <Button size="sm" onClick={save} disabled={pending || checked.size === 0}>
                {pending ? "Enregistrement…" : `Enregistrer (${checked.size})`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, Pencil } from "lucide-react";
import { recordOralTest } from "@/app/(app)/apprenants/admission/actions";
import { LEVELS } from "@/lib/referentiels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type OralTestValues = {
  on: string; // YYYY-MM-DD
  level: string | null;
  evaluator: string | null;
  comment: string | null;
};

// Test oral d'entrée (entretien de positionnement) : saisi en 20 secondes pendant la
// réunion d'information. Le niveau retenu remplit le « Niveau évalué » de la fiche.
export function OralTestDialog({
  learnerId,
  learnerName,
  initial,
  defaultOn,
  defaultEvaluator,
  meetingId,
}: {
  learnerId: string;
  learnerName: string;
  initial: OralTestValues | null;
  defaultOn: string;
  defaultEvaluator: string | null;
  meetingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(initial?.on ?? defaultOn);
  const [level, setLevel] = useState(initial?.level ?? "nd");
  const [evaluator, setEvaluator] = useState(initial?.evaluator ?? defaultEvaluator ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [applyLevel, setApplyLevel] = useState(true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const result = await recordOralTest({
        learnerId,
        on,
        level: level === "nd" ? null : (level as (typeof LEVELS)[number]),
        evaluator: evaluator.trim() || null,
        comment: comment.trim() || null,
        applyLevel,
        meetingId: meetingId ?? null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Test oral enregistré.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" title={`Test oral du ${new Date(`${initial.on}T12:00:00Z`).toLocaleDateString("fr-FR")} — modifier`}>
            <Mic className="mr-1 h-3.5 w-3.5 text-teal-700" />
            {initial.level ?? "fait"}
            <Pencil className="ml-1 h-3 w-3 text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" title="Enregistrer le test oral">
            <Mic className="mr-1 h-3.5 w-3.5" />
            Test oral
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test oral — {learnerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Niveau à l&apos;oral</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nd">Non déterminé</SelectItem>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Évaluateur / évaluatrice</Label>
            <Input value={evaluator} onChange={(e) => setEvaluator(e.target.value)} placeholder="Prénom Nom" />
          </div>
          <div className="space-y-2">
            <Label>Commentaire (optionnel)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Comprend les questions simples, répond par mots isolés ; motivé, disponible le matin…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={applyLevel} onCheckedChange={(v) => setApplyLevel(v === true)} />
            Retenir ce niveau comme « Niveau évalué » de la fiche
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !on}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

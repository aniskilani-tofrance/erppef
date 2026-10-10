"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Sparkles } from "lucide-react";
import { learnerBrief, type BriefResult } from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// « Brief avant d'appeler » : trois lignes pour mener l'appel sans relire le dossier.
export function BriefButton({ learnerId, learnerName, iconOnly = true }: { learnerId: string; learnerName: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<Extract<BriefResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v && !brief) {
      startTransition(async () => {
        const r = await learnerBrief(learnerId);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setBrief(r);
      });
    }
  }
  const asText = brief ? [...brief.lines, `À faire : ${brief.nextStep}`, ...(brief.watchOut ? [`Attention : ${brief.watchOut}`] : [])].join("\n") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size={iconOnly ? "icon" : "sm"} className={iconOnly ? "h-7 w-7" : "h-7 px-2 text-xs"} title="Brief avant d'appeler (assistant)">
          <Sparkles className={`h-3.5 w-3.5 text-primary ${iconOnly ? "" : "mr-1"}`} />
          {!iconOnly && "Brief"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avant d&apos;appeler {learnerName}</DialogTitle>
        </DialogHeader>
        {pending || !brief ? (
          <p className="py-6 text-center text-sm text-muted-foreground">L&apos;assistant lit le dossier…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {brief.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2"><span className="font-medium">À proposer : </span>{brief.nextStep}</p>
            {brief.watchOut && <p className="text-xs text-amber-800">⚠️ {brief.watchOut}</p>}
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(asText); toast.success("Brief copié."); }}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copier
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

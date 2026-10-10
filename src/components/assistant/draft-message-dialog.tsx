"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Sparkles } from "lucide-react";
import type { DraftResult } from "@/app/(app)/assistant/actions";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Un message rédigé par l'assistant, à RELIRE avant d'envoyer : le texte est modifiable,
// WhatsApp ne s'ouvre qu'au second clic (synchrone, sinon les navigateurs le bloquent).
export function DraftMessageDialog({
  title,
  triggerLabel,
  learner,
  load,
  preloaded,
  traceNote,
  size = "sm",
}: {
  title: string;
  triggerLabel: string;
  learner: { id: string; firstName: string; phone: string | null };
  load?: () => Promise<DraftResult>;
  preloaded?: string;
  traceNote: string;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(preloaded ?? "");
  const [hint, setHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v && !preloaded && load && !text) {
      startTransition(async () => {
        const r = await load();
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setText(r.text);
        setHint(r.note ?? null);
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={size === "xs" ? "h-7 px-2 text-xs" : "h-8"} title={`${title} — rédigé par l'assistant, à relire`}>
          <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title} — {learner.firstName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pending && !text ? (
            <p className="py-6 text-center text-sm text-muted-foreground">L&apos;assistant rédige…</p>
          ) : (
            <>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="text-sm" />
              {hint && <p className="text-xs text-muted-foreground">Ton choisi : {hint}</p>}
              <p className="text-xs text-muted-foreground">Relisez, corrigez si besoin, puis envoyez. L&apos;envoi est noté dans le carnet de contact.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(text); toast.success("Message copié."); }}
                  disabled={!text}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copier
                </Button>
                <WhatsAppButton phone={learner.phone} message={text} trace={{ kind: "contact", learnerId: learner.id, note: traceNote }} label="Envoyer sur WhatsApp" variant="default" />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

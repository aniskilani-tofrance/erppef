"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { addReminder, completeReminder } from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ReminderItem = { id: string; text: string; dueOn: string; dueTime: string | null; learnerName: string | null; overdue: boolean };

// Rappels datés (extraits des notes, de l'assistant, ou saisis ici) : une coche = fait.
export function RemindersList({ items }: { items: ReminderItem[] }) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [dueOn, setDueOn] = useState("");
  const router = useRouter();

  function done(id: string) {
    startTransition(async () => {
      const r = await completeReminder(id);
      if (!r.ok) toast.error(r.error ?? "Erreur");
      else router.refresh();
    });
  }
  function add() {
    startTransition(async () => {
      const r = await addReminder({ text: text.trim(), dueOn, dueTime: null, learnerId: null });
      if (!r.ok) toast.error(r.error ?? "Erreur");
      else { setText(""); setDueOn(""); setAdding(false); router.refresh(); }
    });
  }
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });

  return (
    <div className="space-y-1.5 text-sm">
      {items.map((r) => (
        <div key={r.id} className="flex items-start gap-2">
          <Button variant="outline" size="icon" className="mt-0.5 h-5 w-5 shrink-0" onClick={() => done(r.id)} disabled={pending} title="Fait">
            <Check className="h-3 w-3" />
          </Button>
          <span className={r.overdue ? "text-red-700" : ""}>
            <span className="font-medium">{fmt(r.dueOn)}{r.dueTime ? ` ${r.dueTime.slice(0, 5).replace(":", "h")}` : ""}</span>
            {" · "}{r.text}
            {r.learnerName && <span className="text-xs text-muted-foreground"> ({r.learnerName})</span>}
          </span>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Rappeler…" className="h-8 w-56 text-sm" />
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="h-8 w-40 text-sm" />
          <Button size="sm" className="h-8" onClick={add} disabled={pending || !text.trim() || !dueOn}>Ajouter</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(false)} disabled={pending}>Annuler</Button>
        </div>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3" />
          Ajouter un rappel
        </button>
      )}
    </div>
  );
}

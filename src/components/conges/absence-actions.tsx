"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { cancelAbsenceRequest, decideAbsence } from "@/app/(app)/conges/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Coordination : valider / refuser une demande (avec un mot au formateur si refus).
export function DecideAbsenceButtons({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const router = useRouter();

  function decide(decision: "approuvee" | "refusee") {
    startTransition(async () => {
      const result = await decideAbsence({ id, decision, note: note.trim() || null });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(result.message);
        setRefusing(false);
        router.refresh();
      }
    });
  }

  if (refusing) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Un mot pour le formateur (optionnel)" className="h-7 w-56 text-xs" />
        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => decide("refusee")} disabled={pending}>Confirmer le refus</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRefusing(false)} disabled={pending}>Annuler</Button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => decide("approuvee")} disabled={pending} title="Valider ce congé">
        <Check className="mr-1 h-3.5 w-3.5" />
        Valider
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRefusing(true)} disabled={pending} title="Refuser avec un mot d'explication">
        <X className="mr-1 h-3.5 w-3.5" />
        Refuser
      </Button>
    </span>
  );
}

// Formateur : retirer une demande encore en attente
export function CancelRequestButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function cancel() {
    startTransition(async () => {
      const result = await cancelAbsenceRequest(id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  }
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={cancel} disabled={pending}>
      Retirer la demande
    </Button>
  );
}

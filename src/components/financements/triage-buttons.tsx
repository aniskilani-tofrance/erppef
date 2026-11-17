"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triageOpportunity } from "@/app/(app)/financements/actions";

// Les trois boutons de tri d'une opportunité « nouveau » : Écarter (raison obligatoire,
// en une ligne), À surveiller, Évaluer.
export function TriageButtons({ id, compact = false }: { id: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();

  function send(status: "ecarte" | "a_surveiller" | "a_evaluer") {
    startTransition(async () => {
      const r = await triageOpportunity({ id, status, reason: status === "ecarte" ? reason : null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setDiscarding(false);
      setReason("");
      router.refresh();
    });
  }

  if (discarding) {
    return (
      <form
        className="flex w-full flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          send("ecarte");
        }}
      >
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Pourquoi ? (une ligne)"
          className="h-8 min-w-0 flex-1 text-sm"
          maxLength={500}
          aria-label="Raison de l'écart"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={pending || !reason.trim()}>Écarter</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDiscarding(false)}>Annuler</Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDiscarding(true)}>
        <X className="h-3.5 w-3.5" />
        Écarter
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => send("a_surveiller")}>
        <Eye className="h-3.5 w-3.5" />
        {compact ? "Surveiller" : "À surveiller"}
      </Button>
      <Button type="button" size="sm" disabled={pending} onClick={() => send("a_evaluer")}>
        <Scale className="h-3.5 w-3.5" />
        Évaluer
      </Button>
    </div>
  );
}

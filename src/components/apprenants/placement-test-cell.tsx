"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePlus2 } from "lucide-react";
import { createPlacementTest } from "@/app/(app)/apprenants/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PlacementInfo = {
  status: "en_attente" | "fait";
  token: string;
  level: string | null;
  score: number | null;
} | null;

// Statut du test de positionnement d'un apprenant : copier le lien, voir le
// résultat, (re)générer une tentative.
export function PlacementTestCell({ learnerId, test }: { learnerId: string; test: PlacementInfo }) {
  const [pending, startTransition] = useTransition();

  function copy(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/test/${token}`);
    toast.success("Lien du test copié — envoyez-le à l'apprenant (WhatsApp, SMS, email).");
  }

  function generate() {
    startTransition(async () => {
      const result = await createPlacementTest(learnerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      copy(result.token);
    });
  }

  if (test?.status === "fait") {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge variant="secondary">Test fait · {test.level}</Badge>
        {test.score !== null && (
          <span className="text-xs text-muted-foreground">{Math.round(test.score)}/100</span>
        )}
      </span>
    );
  }

  if (test?.status === "en_attente") {
    return (
      <Button variant="outline" size="sm" onClick={() => copy(test.token)}>
        <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
        Copier le lien
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={generate} disabled={pending}>
      <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
      {pending ? "…" : "Générer le test"}
    </Button>
  );
}

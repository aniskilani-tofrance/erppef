"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePlus2, RotateCcw } from "lucide-react";
import { createPlacementTest } from "@/app/(app)/apprenants/actions";
import { buildPlacementInvitation } from "@/lib/placement/invitation-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PlacementInfo = {
  status: "en_attente" | "fait";
  token: string;
  level: string | null;
  score: number | null;
} | null;

// Statut du test de positionnement d'un apprenant : copier l'invitation (consignes +
// lien, signée du prénom de la personne connectée), voir le résultat, (re)générer.
export function PlacementTestCell({
  learnerId,
  test,
  senderFirstName,
}: {
  learnerId: string;
  test: PlacementInfo;
  senderFirstName: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function copy(token: string) {
    const message = buildPlacementInvitation({
      url: `${window.location.origin}/test/${token}`,
      senderFirstName,
    });
    navigator.clipboard.writeText(message);
    toast.success("Invitation copiée (consignes + lien) — collez-la dans WhatsApp, SMS ou email.");
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
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={generate}
          disabled={pending}
          title="Nouvelle tentative (nouveau lien) — l'ancien résultat est conservé"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          {pending ? "…" : "Refaire"}
        </Button>
      </span>
    );
  }

  if (test?.status === "en_attente") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => copy(test.token)}
        title="Copie un message prêt à envoyer : consignes + lien personnel du test"
      >
        <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
        Copier l&apos;invitation
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

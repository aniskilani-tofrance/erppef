"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePlus2, RotateCcw } from "lucide-react";
import { createPlacementTest } from "@/app/(app)/apprenants/actions";
import { buildPlacementInvitation } from "@/lib/placement/invitation-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";

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
  phone = null,
}: {
  learnerId: string;
  test: PlacementInfo;
  senderFirstName: string | null;
  phone?: string | null;
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
      <span className="inline-flex items-center gap-1">
        {/* WhatsApp d'abord : l'invitation part pré-remplie, sans copier-coller */}
        <WhatsAppButton
          phone={phone}
          message={() =>
            buildPlacementInvitation({ url: `${window.location.origin}/test/${test.token}`, senderFirstName })
          }
          trace={{ kind: "contact", learnerId, note: "Invitation au test de positionnement (WhatsApp)" }}
          label="WhatsApp"
          title="Envoyer l'invitation au test sur WhatsApp (message pré-rempli)"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => copy(test.token)}
          title="Copie un message prêt à envoyer : consignes + lien personnel du test (SMS, email…)"
        >
          <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
          Copier
        </Button>
      </span>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={generate} disabled={pending}>
      <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
      {pending ? "…" : "Générer le test"}
    </Button>
  );
}

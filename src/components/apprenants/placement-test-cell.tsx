"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FilePlus2, Info, RotateCcw } from "lucide-react";
import { createPlacementTest } from "@/app/(app)/apprenants/actions";
import { buildPlacementInvitation } from "@/lib/placement/invitation-message";
import { DEFAULT_TEMPLATES } from "@/lib/admission/templates";
import type { SynthesePositionnement } from "@/lib/positionnement/synthese";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { PositionnementDetail } from "@/components/apprenants/positionnement-detail";

export type PlacementInfo = {
  status: "en_attente" | "fait";
  token: string;
  level: string | null;
  score: number | null;
  // Test de positionnement version ToFrance (depuis le 23/10/2026) : détail par compétence.
  // Absent (null) pour les anciens tests : affichage inchangé.
  synthese?: SynthesePositionnement | null;
  completedAt?: string | null;
} | null;

// Statut du test de positionnement d'un apprenant : copier l'invitation (consignes +
// lien, signée du prénom de la personne connectée), voir le résultat, (re)générer.
export function PlacementTestCell({
  learnerId,
  test,
  senderFirstName,
  learnerFirstName = null,
  phone = null,
  template,
}: {
  learnerId: string;
  test: PlacementInfo;
  senderFirstName: string | null;
  learnerFirstName?: string | null;
  phone?: string | null;
  // Modèle « test_positionnement » de l'organisme (retouché ou non) ; défaut du code sinon
  template?: string;
}) {
  const [pending, startTransition] = useTransition();

  const templates = template ? { ...DEFAULT_TEMPLATES, test_positionnement: template } : DEFAULT_TEMPLATES;
  function copy(token: string) {
    const message = buildPlacementInvitation({
      url: `${window.location.origin}/test/${token}`,
      senderFirstName,
      learnerFirstName,
      templates,
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
        {test.synthese ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" title="Niveau par compétence, profil (à confirmer par un formateur)">
                <Info className="mr-1 h-3 w-3" />
                Détail
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-96">
              <PositionnementDetail synthese={test.synthese} level={test.level} completedAt={test.completedAt ?? null} />
              {test.score !== null && (
                <p className="text-xs text-muted-foreground">
                  Réussite : {Math.round(test.score)} % des questions posées. Le test s&apos;adapte à chacun : comparez les niveaux, pas ce chiffre.
                </p>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          test.score !== null && <span className="text-xs text-muted-foreground">{Math.round(test.score)}/100</span>
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
            buildPlacementInvitation({ url: `${window.location.origin}/test/${test.token}`, senderFirstName, learnerFirstName, templates })
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

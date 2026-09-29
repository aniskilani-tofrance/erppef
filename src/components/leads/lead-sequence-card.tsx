"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, OctagonX, RotateCcw } from "lucide-react";
import { liftLeadOppositionAction, stopLeadSequenceAction } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// La carte « Séquence automatique » de la fiche : où en est la relance qui tourne toute
// seule, ce qu'elle a envoyé, pourquoi elle s'est arrêtée, et deux boutons pour reprendre
// la main. Les libellés et les dates arrivent déjà formatés depuis la page (serveur).

export type LeadSequenceCardProps = {
  leadId: string;
  canLift: boolean; // direction : peut lever une opposition posée par erreur
  automationsOn: boolean;
  sequence: {
    active: boolean;
    label: string | null; // « Injoignable », « Rendez-vous manqué »…
    lastStepLabel: string | null;
    nextLabel: string | null;
    nextAt: string | null; // déjà formaté
    lastSentAt: string | null;
    stoppedAt: string | null;
    stopReasonLabel: string | null;
  };
  email: { label: string | null; at: string | null; blocking: boolean };
  phoneInvalid: boolean;
  optOutAt: string | null; // déjà formaté
};

export function LeadSequenceCard({ leadId, canLift, automationsOn, sequence, email, phoneInvalid, optOutAt }: LeadSequenceCardProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function stop(opposition: boolean) {
    if (opposition && !window.confirm("Enregistrer l'opposition du restaurateur ? Plus aucun message automatique ne lui sera envoyé, sur aucun canal, et les rappels programmés seront annulés.")) return;
    startTransition(async () => {
      const r = await stopLeadSequenceAction({ leadId, opposition });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(opposition ? "Opposition enregistrée." : "Séquence arrêtée.");
        router.refresh();
      }
    });
  }

  function lift() {
    if (!window.confirm("Lever l'opposition ? Les messages automatiques pourront reprendre pour cette fiche.")) return;
    startTransition(async () => {
      const r = await liftLeadOppositionAction({ leadId });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Opposition levée.");
        router.refresh();
      }
    });
  }

  return (
    <Card className={cn(optOutAt && "border-red-300")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Séquence automatique</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {optOutAt && (
          <p className="text-red-700">
            <span className="font-medium">Opposition enregistrée le {optOutAt}.</span> Plus aucun e-mail ni SMS automatique ne part vers cette fiche.
          </p>
        )}

        {sequence.active ? (
          <div className="space-y-1">
            <p>
              <span className="font-medium">« {sequence.label} » en cours.</span>
              {sequence.lastStepLabel ? <span className="text-muted-foreground"> Dernière étape : {sequence.lastStepLabel}.</span> : <span className="text-muted-foreground"> Aucune étape encore partie.</span>}
            </p>
            {sequence.nextLabel && (
              <p className="text-muted-foreground">
                Prochaine étape : {sequence.nextLabel}{sequence.nextAt ? `, le ${sequence.nextAt}` : ""}.
              </p>
            )}
            {sequence.lastSentAt && <p className="text-xs text-muted-foreground">Dernier message automatique : {sequence.lastSentAt}.</p>}
            {!automationsOn && (
              <p className="text-xs text-amber-700">Les envois automatiques sont à l&apos;arrêt (Réglages) : les étapes attendent et partiront à la réactivation, une par jour au plus.</p>
            )}
          </div>
        ) : sequence.label && sequence.stopReasonLabel ? (
          <p className="text-muted-foreground">
            « {sequence.label} » arrêtée{sequence.stoppedAt ? ` le ${sequence.stoppedAt}` : ""} : {sequence.stopReasonLabel}.
            {sequence.lastSentAt ? ` Dernier message automatique : ${sequence.lastSentAt}.` : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Aucune séquence en cours. Elle démarre toute seule : appel tombé sur la messagerie → « Injoignable » (J+1, J+3, J+6, J+10) ; rendez-vous manqué → J+1 et J+3 ; statut « Proposition envoyée » → J+2 ouvré et J+7 ; statut « En veille » → J+30, J+60, J+90.
          </p>
        )}

        {(email.label || phoneInvalid) && (
          <ul className="space-y-0.5 text-xs">
            {email.label && (
              <li className={cn(email.blocking ? "text-red-700" : "text-muted-foreground")}>
                Retour Brevo : {email.label}{email.at ? ` (${email.at})` : ""}.
              </li>
            )}
            {phoneInvalid && <li className="text-red-700">Numéro refusé par Twilio : plus aucun SMS automatique, vérifier le numéro avec le restaurateur.</li>}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {sequence.active && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => stop(false)} title="Arrête les relances automatiques de cette fiche ; vous reprenez la main">
              <OctagonX className="mr-1.5 h-3.5 w-3.5" />Arrêter la séquence
            </Button>
          )}
          {!optOutAt && (
            <Button variant="outline" size="sm" className="text-red-700" disabled={pending} onClick={() => stop(true)} title="Le restaurateur ne veut plus rien recevoir : plus aucun message automatique, rappels annulés">
              <Ban className="mr-1.5 h-3.5 w-3.5" />Opposition du prospect
            </Button>
          )}
          {optOutAt && canLift && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={lift} title="Opposition posée par erreur : la lever (direction)">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Lever l&apos;opposition
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

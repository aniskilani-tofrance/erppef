"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Tablet } from "lucide-react";
import { prepareSigningLink } from "@/app/(app)/apprenants/documents-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// « Faire signer sur cette tablette » : ouvre la page de signature de la personne sur cet
// appareil (lien de 2 heures, refermé dès la signature). « Envoyer le lien WhatsApp » :
// lien personnel de 30 jours et message prérempli (vouvoiement, mots simples).
export function SignatureButtons({
  learnerId,
  groupId,
  learnerName,
  canSignHere,
  canSendLink,
  size = "sm",
}: {
  learnerId: string;
  groupId: string;
  learnerName: string;
  canSignHere: boolean;
  canSendLink: boolean;
  size?: "sm" | "xs";
}) {
  const [pending, start] = useTransition();
  const [prepared, setPrepared] = useState<{ message: string; whatsappUrl: string | null; url: string } | null>(null);
  const cls = size === "xs" ? "h-7 px-2 text-xs" : "";

  const signHere = () =>
    start(async () => {
      const res = await prepareSigningLink({ learnerId, groupId, channel: "sur_place" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Même onglet : la personne signe sur cet appareil, puis rend la tablette.
      window.location.assign(res.url);
    });

  const sendLink = () =>
    start(async () => {
      const res = await prepareSigningLink({ learnerId, groupId, channel: "lien" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPrepared({ message: res.message ?? res.url, whatsappUrl: res.whatsappUrl, url: res.url });
    });

  return (
    <>
      {canSignHere && (
        <Button variant="outline" size="sm" className={cls} onClick={signHere} disabled={pending} title="Faire signer sur cette tablette">
          <Tablet className="mr-1 h-3.5 w-3.5" />
          Faire signer ici
        </Button>
      )}
      {canSendLink && (
        <Button variant="outline" size="sm" className={cls} onClick={sendLink} disabled={pending} title="Envoyer le lien WhatsApp">
          <MessageCircle className="mr-1 h-3.5 w-3.5" />
          Lien WhatsApp
        </Button>
      )}
      <Dialog open={prepared !== null} onOpenChange={(o) => !o && setPrepared(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lien de signature — {learnerName}</DialogTitle>
          </DialogHeader>
          {prepared && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Lien personnel valable 30 jours : la personne lit et signe chez elle le bulletin d&apos;adhésion, le contrat et le règlement. Relisez le message puis envoyez-le.
              </p>
              <Textarea readOnly value={prepared.message} rows={12} className="text-sm" />
              <div className="flex flex-wrap gap-2">
                {prepared.whatsappUrl ? (
                  <Button asChild size="sm">
                    {/* Ouverture dans le clic : jamais bloquée par le navigateur */}
                    <a href={prepared.whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Ouvrir WhatsApp
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-amber-700">Pas de numéro WhatsApp valable sur la fiche : copiez le message.</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(prepared.message).then(
                      () => toast.success("Message copié."),
                      () => toast.error("Copie impossible : sélectionnez le texte."),
                    )
                  }
                >
                  <Copy className="mr-1 h-4 w-4" />
                  Copier le message
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

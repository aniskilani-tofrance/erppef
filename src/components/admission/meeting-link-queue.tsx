"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ListChecks, MessageCircle } from "lucide-react";
import { markMeetingLinkSent, prepareMeetingLinkQueue } from "@/app/(app)/apprenants/admission/actions";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { LINK_RECENT_DAYS, type LinkTarget } from "@/lib/inscription/link-queue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// « Envoyer le lien à la suite » (carte « Inscription par lien ») : le message du lien à chaque
// convoqué qui n'a pas encore de place, un par un sur WhatsApp. « Envoyer au suivant » ouvre WhatsApp
// avec le message et le numéro de la personne suivante ; on appuie sur Envoyer, on revient. Chaque
// envoi est noté au journal (convocation « envoyée »). Aucune API WhatsApp : rien ne part sans un geste.
export function MeetingLinkQueue({ meetingId, message, disabled = false }: { meetingId: string; message: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [targets, setTargets] = useState<LinkTarget[] | null>(null);
  const [skippedRegistered, setSkippedRegistered] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (sent.size) router.refresh();
      return;
    }
    setTargets(null);
    setSent(new Set());
    startLoading(async () => {
      const result = await prepareMeetingLinkQueue(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setTargets(result.targets);
      setSkippedRegistered(result.skippedRegistered);
      // Coché d'office : joignable sur WhatsApp, et pas déjà reçu le lien ces derniers jours.
      setChecked(new Set(result.targets.filter((t) => t.phoneOk && !t.alreadySentAt).map((t) => t.learnerId)));
    });
  }

  const queue = useMemo(() => (targets ?? []).filter((t) => checked.has(t.learnerId) && !sent.has(t.learnerId) && t.phoneOk), [targets, checked, sent]);
  const total = (targets ?? []).filter((t) => checked.has(t.learnerId)).length;
  const next = queue[0] ?? null;

  function send(t: LinkTarget) {
    const number = toWhatsAppNumber(t.phone);
    if (!number) return;
    // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setSent((prev) => new Set(prev).add(t.learnerId));
    void markMeetingLinkSent({ meetingId, learnerId: t.learnerId }).then((r) => {
      if (!r.ok) toast.error(`${t.name} : ${r.error}`);
    });
  }

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  const noPhone = (targets ?? []).filter((t) => !t.phoneOk).length;
  const recent = (targets ?? []).filter((t) => t.alreadySentAt).length;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(true)}
        disabled={disabled}
        title={disabled ? "Ouvrez d'abord l'inscription par lien" : "Envoyer le message du lien à chaque convoqué sans place, un par un"}
      >
        <ListChecks className="mr-1 h-4 w-4" />
        Envoyer aux convoqués, un par un
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer le lien aux convoqués</DialogTitle>
          </DialogHeader>
          {loading || !targets ? (
            <p className="text-sm text-muted-foreground">Préparation de la liste…</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Personne à qui envoyer : aucun convoqué sans place sur ce lien.
              {skippedRegistered ? ` (${skippedRegistered} déjà inscrit${skippedRegistered > 1 ? "s" : ""}.)` : ""}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {targets.length} convoqué{targets.length > 1 ? "s" : ""} sans place sur ce lien
                {skippedRegistered ? ` (${skippedRegistered} déjà inscrit${skippedRegistered > 1 ? "s" : ""}, exclu${skippedRegistered > 1 ? "s" : ""})` : ""}.
                {noPhone ? ` ${noPhone} sans numéro WhatsApp.` : ""}
                {recent ? ` ${recent} ont déjà reçu le lien depuis moins de ${LINK_RECENT_DAYS} jours : décoché${recent > 1 ? "s" : ""}.` : ""}
              </p>

              <Button className="w-full" size="lg" onClick={() => next && send(next)} disabled={!next}>
                <MessageCircle className="mr-2 h-4 w-4" />
                {next ? `Envoyer au suivant : ${next.name} (${total - queue.length + 1}/${total})` : sent.size ? `Terminé : ${sent.size} envoyé${sent.size > 1 ? "s" : ""}` : "Cochez au moins une personne"}
              </Button>
              <p className="text-xs text-muted-foreground">
                WhatsApp s&apos;ouvre avec le message du lien : appuyez sur Envoyer, revenez ici, puis passez au suivant. Chaque envoi est noté au journal.
              </p>

              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {targets.map((t) => {
                  const isSent = sent.has(t.learnerId);
                  return (
                    <li key={t.learnerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked.has(t.learnerId)}
                        onCheckedChange={(v) => toggle(t.learnerId, v === true)}
                        disabled={!t.phoneOk || isSent}
                        aria-label={`Inclure ${t.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {!t.phoneOk && <span>Pas de numéro WhatsApp</span>}
                          {t.alreadySentAt && (
                            <span>Lien déjà envoyé le {new Date(t.alreadySentAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                          )}
                        </div>
                      </div>
                      {isSent ? (
                        <span className="inline-flex items-center text-xs text-emerald-700"><Check className="mr-1 h-3.5 w-3.5" />Envoyé</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700" onClick={() => send(t)} disabled={!t.phoneOk} title="Envoyer à cette personne maintenant">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />
                          WhatsApp
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

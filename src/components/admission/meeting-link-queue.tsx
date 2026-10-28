"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ListChecks, MessageCircle, MessageSquareText } from "lucide-react";
import { markMeetingLinkSent, prepareMeetingLinkQueue } from "@/app/(app)/apprenants/admission/actions";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { LINK_RECENT_DAYS, smsUrl, type LinkTarget } from "@/lib/inscription/link-queue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Channel = "whatsapp" | "sms";

// Le lien « sms: » n'ouvre l'application Messages que sur un téléphone (ou un Mac relié à l'iPhone) :
// ailleurs, le bouton SMS reste grisé pour ne pas noter au journal un envoi qui n'a pas eu lieu.
function canSendSms(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
}

// « Envoyer le lien à la suite » (carte « Inscription par lien ») : le message du lien à chaque
// convoqué qui n'a pas encore de place, un par un. « WhatsApp au suivant » ouvre WhatsApp avec le
// message et le numéro de la personne suivante ; « SMS au suivant » ouvre l'application Messages du
// téléphone avec un message court (gratuit : c'est le forfait du téléphone). On appuie sur Envoyer,
// on revient. Chaque envoi est noté au journal (convocation « envoyée »). Aucune API : rien ne part
// sans un geste.
export function MeetingLinkQueue({
  meetingId,
  message,
  smsMessage,
  disabled = false,
}: {
  meetingId: string;
  message: string;
  smsMessage: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [targets, setTargets] = useState<LinkTarget[] | null>(null);
  const [skippedRegistered, setSkippedRegistered] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Map<string, Channel>>(new Map());
  const [smsOk, setSmsOk] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (sent.size) router.refresh();
      return;
    }
    setTargets(null);
    setSent(new Map());
    setSmsOk(canSendSms());
    startLoading(async () => {
      const result = await prepareMeetingLinkQueue(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setTargets(result.targets);
      setSkippedRegistered(result.skippedRegistered);
      // Coché d'office : numéro utilisable, et pas déjà reçu le lien ces derniers jours.
      setChecked(new Set(result.targets.filter((t) => t.phoneOk && !t.alreadySentAt).map((t) => t.learnerId)));
    });
  }

  const queue = useMemo(() => (targets ?? []).filter((t) => checked.has(t.learnerId) && !sent.has(t.learnerId) && t.phoneOk), [targets, checked, sent]);
  const total = (targets ?? []).filter((t) => checked.has(t.learnerId)).length;
  const next = queue[0] ?? null;

  function send(t: LinkTarget, channel: Channel) {
    if (channel === "sms") {
      const url = smsUrl(t.phone, smsMessage);
      if (!url) return;
      // Ouverture dans le clic : l'application Messages prend la main, la page reste derrière.
      window.location.href = url;
    } else {
      const number = toWhatsAppNumber(t.phone);
      if (!number) return;
      // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
    setSent((prev) => new Map(prev).set(t.learnerId, channel));
    void markMeetingLinkSent({ meetingId, learnerId: t.learnerId, channel }).then((r) => {
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
  const step = next ? ` : ${next.name} (${total - queue.length + 1}/${total})` : "";
  const doneLabel = sent.size ? `Terminé : ${sent.size} envoyé${sent.size > 1 ? "s" : ""}` : "Cochez au moins une personne";
  const smsTitle = smsOk ? "SMS depuis ce téléphone (gratuit avec le forfait)" : "Le SMS part du téléphone : ouvrez cette page sur votre téléphone";

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
                {noPhone ? ` ${noPhone} sans numéro utilisable.` : ""}
                {recent ? ` ${recent} ont déjà reçu le lien depuis moins de ${LINK_RECENT_DAYS} jours : décoché${recent > 1 ? "s" : ""}.` : ""}
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" size="lg" onClick={() => next && send(next, "whatsapp")} disabled={!next}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  <span className="truncate">{next ? `WhatsApp au suivant${step}` : doneLabel}</span>
                </Button>
                <Button
                  className="w-full"
                  size="lg"
                  variant="outline"
                  onClick={() => next && send(next, "sms")}
                  disabled={!next || !smsOk}
                  title={smsTitle}
                >
                  <MessageSquareText className="mr-2 h-4 w-4" />
                  <span className="truncate">{next ? `SMS au suivant${step}` : doneLabel}</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                WhatsApp ou Messages s&apos;ouvre avec le message du lien : appuyez sur Envoyer, revenez ici, puis passez au suivant. Chaque envoi est noté au journal.
                {" "}Le SMS est gratuit : il part du téléphone, avec un message court
                {smsOk ? "." : " — ouvrez cette page sur votre téléphone pour l'utiliser."}
              </p>

              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {targets.map((t) => {
                  const sentBy = sent.get(t.learnerId);
                  return (
                    <li key={t.learnerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked.has(t.learnerId)}
                        onCheckedChange={(v) => toggle(t.learnerId, v === true)}
                        disabled={!t.phoneOk || Boolean(sentBy)}
                        aria-label={`Inclure ${t.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {!t.phoneOk && <span>Pas de numéro utilisable</span>}
                          {t.alreadySentAt && (
                            <span>Lien déjà envoyé le {new Date(t.alreadySentAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                          )}
                        </div>
                      </div>
                      {sentBy ? (
                        <span className="inline-flex items-center text-xs text-emerald-700">
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Envoyé ({sentBy === "sms" ? "SMS" : "WhatsApp"})
                        </span>
                      ) : (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700" onClick={() => send(t, "whatsapp")} disabled={!t.phoneOk} title="Envoyer à cette personne maintenant sur WhatsApp">
                            <MessageCircle className="mr-1 h-3.5 w-3.5" />
                            WhatsApp
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => send(t, "sms")} disabled={!t.phoneOk || !smsOk} title={smsTitle}>
                            <MessageSquareText className="mr-1 h-3.5 w-3.5" />
                            SMS
                          </Button>
                        </div>
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

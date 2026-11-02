"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageCircle, MessageSquareText, UsersRound } from "lucide-react";
import { markGroupWhatsAppInviteSent, prepareGroupWhatsAppInvites } from "@/app/(app)/groupes/actions";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { canSendSms, smsUrl } from "@/lib/inscription/link-queue";
import type { InviteTarget } from "@/lib/groupes/whatsapp-group";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Channel = "whatsapp" | "sms";
type Target = InviteTarget & { message: string };

// « Inviter tout le groupe » (carte « Groupe WhatsApp de la classe ») : le lien du groupe à chaque
// inscrit qui n'a pas refusé, un par un. « WhatsApp au suivant » ouvre WhatsApp avec le message et
// le numéro de la personne suivante ; « SMS au suivant » ouvre l'application Messages du téléphone
// avec un message court. On appuie sur Envoyer, on revient. Chaque envoi est noté au journal ; une
// personne déjà invitée est décochée. Aucune API : rien ne part sans un geste.
export function WhatsAppGroupInviteQueue({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [refused, setRefused] = useState(0);
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
      const result = await prepareGroupWhatsAppInvites(groupId);
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setTargets(result.targets);
      setSmsMessage(result.smsMessage);
      setRefused(result.refused);
      // Coché d'office : numéro utilisable, et pas encore invité à ce groupe.
      setChecked(new Set(result.targets.filter((t) => t.phoneOk && !t.alreadySentAt).map((t) => t.learnerId)));
    });
  }

  const queue = useMemo(() => (targets ?? []).filter((t) => checked.has(t.learnerId) && !sent.has(t.learnerId) && t.phoneOk), [targets, checked, sent]);
  const total = (targets ?? []).filter((t) => checked.has(t.learnerId)).length;
  const next = queue[0] ?? null;

  function send(t: Target, channel: Channel) {
    if (channel === "sms") {
      const url = smsUrl(t.phone, smsMessage);
      if (!url) return;
      // Ouverture dans le clic : l'application Messages prend la main, la page reste derrière.
      window.location.href = url;
    } else {
      const number = toWhatsAppNumber(t.phone);
      if (!number) return;
      // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(t.message)}`, "_blank", "noopener,noreferrer");
    }
    setSent((prev) => new Map(prev).set(t.learnerId, channel));
    void markGroupWhatsAppInviteSent({ groupId, learnerId: t.learnerId, channel }).then((r) => {
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
  const already = (targets ?? []).filter((t) => t.alreadySentAt).length;
  const step = next ? ` : ${next.name} (${total - queue.length + 1}/${total})` : "";
  const doneLabel = sent.size ? `Terminé : ${sent.size} invité${sent.size > 1 ? "s" : ""}` : "Cochez au moins une personne";
  const smsTitle = smsOk ? "SMS depuis ce téléphone (gratuit avec le forfait)" : "Le SMS part du téléphone : ouvrez cette page sur votre téléphone";

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(true)} title="Envoyer le lien du groupe à chaque inscrit, un par un">
        <UsersRound className="mr-1 h-4 w-4" />
        Inviter tout le groupe
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Inviter les inscrits au groupe WhatsApp</DialogTitle>
          </DialogHeader>
          {loading || !targets ? (
            <p className="text-sm text-muted-foreground">Préparation de la liste…</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Personne à inviter : aucun inscrit dans ce groupe
              {refused ? ` (${refused} ${refused > 1 ? "ont" : "a"} refusé le groupe WhatsApp)` : ""}.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {targets.length} inscrit{targets.length > 1 ? "s" : ""} à inviter
                {refused ? ` (${refused} ${refused > 1 ? "ont" : "a"} refusé le groupe : exclu${refused > 1 ? "s" : ""})` : ""}.
                {noPhone ? ` ${noPhone} sans numéro utilisable.` : ""}
                {already ? ` ${already} déjà invité${already > 1 ? "s" : ""} : décoché${already > 1 ? "s" : ""}.` : ""}
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" size="lg" onClick={() => next && send(next, "whatsapp")} disabled={!next}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  <span className="truncate">{next ? `WhatsApp au suivant${step}` : doneLabel}</span>
                </Button>
                <Button className="w-full" size="lg" variant="outline" onClick={() => next && send(next, "sms")} disabled={!next || !smsOk} title={smsTitle}>
                  <MessageSquareText className="mr-2 h-4 w-4" />
                  <span className="truncate">{next ? `SMS au suivant${step}` : doneLabel}</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                WhatsApp ou Messages s&apos;ouvre avec le message et le lien du groupe : appuyez sur Envoyer, revenez ici, puis passez au suivant. Chaque invitation est notée au journal de la personne.
                {" "}Le message se modifie dans Apprenants → Admission → « Messages ».
                {smsOk ? "" : " Le SMS part du téléphone : ouvrez cette page sur votre téléphone pour l'utiliser."}
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
                          {t.consent === true && <span className="text-emerald-700">A dit oui au groupe</span>}
                          {!t.phoneOk && <span>Pas de numéro utilisable</span>}
                          {t.alreadySentAt && (
                            <span>Déjà invité le {new Date(t.alreadySentAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                          )}
                        </div>
                      </div>
                      {sentBy ? (
                        <span className="inline-flex items-center text-xs text-emerald-700">
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Invité ({sentBy === "sms" ? "SMS" : "WhatsApp"})
                        </span>
                      ) : (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700" onClick={() => send(t, "whatsapp")} disabled={!t.phoneOk} title="Inviter cette personne maintenant sur WhatsApp">
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

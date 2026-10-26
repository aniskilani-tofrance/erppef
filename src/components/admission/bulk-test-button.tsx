"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ClipboardCheck, MessageCircle } from "lucide-react";
import { logContact, prepareBulkPlacementTests } from "@/app/(app)/apprenants/admission/actions";
import { DEFAULT_TEMPLATES } from "@/lib/admission/templates";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { BULK_TEST_NOTE, RECENT_DAYS, type BulkTarget } from "@/lib/placement/bulk";
import { buildPlacementInvitation } from "@/lib/placement/invitation-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// « Envoyer le test » (en-tête de l'onglet Admission) : invitation au test de
// positionnement pour tous les « À contacter » et « Contacté » sans test fait. L'ERP
// crée les liens manquants, puis on envoie un par un sur WhatsApp : « Envoyer au
// suivant » ouvre WhatsApp avec le message pré-rempli de la personne suivante, on
// appuie sur Envoyer, on revient. Chaque envoi est tracé (journal + « Contacté »).
// Aucune API WhatsApp : zéro coût, et rien ne part sans un geste de l'équipe.

const STATUS_LABEL: Record<string, string> = { nouveau: "À contacter", contacte: "Contacté" };

export function BulkTestButton({ template, senderFirstName }: { template?: string; senderFirstName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [targets, setTargets] = useState<BulkTarget[] | null>(null);
  const [skippedDone, setSkippedDone] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const templates = template ? { ...DEFAULT_TEMPLATES, test_positionnement: template } : DEFAULT_TEMPLATES;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      if (sent.size) router.refresh();
      return;
    }
    setTargets(null);
    setSent(new Set());
    startLoading(async () => {
      const result = await prepareBulkPlacementTests();
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      setTargets(result.targets);
      setSkippedDone(result.skippedDone);
      // Coché d'office : joignable sur WhatsApp, et pas déjà invité(e) ces derniers jours.
      setChecked(new Set(result.targets.filter((t) => t.phoneOk && t.token && !t.alreadySentAt).map((t) => t.learnerId)));
      if (result.created) toast.success(`${result.created} lien${result.created > 1 ? "s" : ""} de test créé${result.created > 1 ? "s" : ""}.`);
    });
  }

  const queue = useMemo(
    () => (targets ?? []).filter((t) => checked.has(t.learnerId) && !sent.has(t.learnerId) && t.phoneOk && t.token),
    [targets, checked, sent],
  );
  const total = (targets ?? []).filter((t) => checked.has(t.learnerId)).length;
  const next = queue[0] ?? null;

  function send(t: BulkTarget) {
    const number = toWhatsAppNumber(t.phone);
    if (!number || !t.token) return;
    const text = buildPlacementInvitation({
      url: `${window.location.origin}/test/${t.token}`,
      senderFirstName,
      learnerFirstName: t.firstName,
      templates,
    });
    // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setSent((prev) => new Set(prev).add(t.learnerId));
    void logContact({ learnerId: t.learnerId, channel: "whatsapp", outcome: "message_envoye", note: BULK_TEST_NOTE, status: null }).then((r) => {
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
      <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
        Envoyer le test
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer le test de positionnement</DialogTitle>
          </DialogHeader>
          {loading || !targets ? (
            <p className="text-sm text-muted-foreground">Préparation des liens…</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Personne à inviter : aucun « À contacter » ni « Contacté » sans test fait.
              {skippedDone ? ` (${skippedDone} ont déjà un niveau ou un test fait.)` : ""}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {targets.length} personne{targets.length > 1 ? "s" : ""} « À contacter » ou « Contacté » sans test fait
                {skippedDone ? ` (${skippedDone} déjà évaluée${skippedDone > 1 ? "s" : ""}, exclue${skippedDone > 1 ? "s" : ""})` : ""}.
                {noPhone ? ` ${noPhone} sans numéro WhatsApp.` : ""}
                {recent ? ` ${recent} déjà invitée${recent > 1 ? "s" : ""} depuis moins de ${RECENT_DAYS} jours : décochée${recent > 1 ? "s" : ""}.` : ""}
              </p>

              <Button className="w-full" size="lg" onClick={() => next && send(next)} disabled={!next}>
                <MessageCircle className="mr-2 h-4 w-4" />
                {next ? `Envoyer au suivant : ${next.name} (${total - queue.length + 1}/${total})` : sent.size ? `Terminé : ${sent.size} envoyé${sent.size > 1 ? "s" : ""}` : "Cochez au moins une personne"}
              </Button>
              <p className="text-xs text-muted-foreground">
                WhatsApp s&apos;ouvre avec le message et le lien personnel : appuyez sur Envoyer, revenez ici, puis passez au suivant.
              </p>

              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {targets.map((t) => {
                  const isSent = sent.has(t.learnerId);
                  const usable = t.phoneOk && Boolean(t.token);
                  return (
                    <li key={t.learnerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked.has(t.learnerId)}
                        onCheckedChange={(v) => toggle(t.learnerId, v === true)}
                        disabled={!usable || isSent}
                        aria-label={`Inclure ${t.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                          {!t.phoneOk && <span>Pas de numéro WhatsApp</span>}
                          {t.alreadySentAt && (
                            <span>Déjà invité(e) le {new Date(t.alreadySentAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
                          )}
                        </div>
                      </div>
                      {isSent ? (
                        <span className="inline-flex items-center text-xs text-emerald-700"><Check className="mr-1 h-3.5 w-3.5" />Envoyé</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700" onClick={() => send(t)} disabled={!usable} title="Envoyer à cette personne maintenant">
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

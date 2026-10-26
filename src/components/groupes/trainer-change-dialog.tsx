"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UserRoundCog } from "lucide-react";
import { applyTrainerChange, previewTrainerChange } from "@/app/(app)/groupes/formateur-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { previewHeadline, seances, type TrainerChangePreview, type TrainerChoice } from "@/lib/groupes/changer-formateur";

const joinNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}` : names[0] ?? "");

/** Ce qui va se passer, écrit avant la validation (rendu testé sans navigateur). */
export function TrainerChangeSummary({ preview }: { preview: TrainerChangePreview }) {
  const who = preview.trainerFirstName;
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="trainer-change-summary">
      <p className="font-medium">{previewHeadline(preview)}</p>
      {preview.conflicts.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-amber-800">
          {preview.conflicts.map((c) => (
            <li key={c.sessionId}>
              {c.when} : {c.reason} — {c.keeps ? `reste à ${c.keeps}` : "reste sans formateur"}
            </li>
          ))}
        </ul>
      )}
      {preview.assign > 0 && preview.firstOn && (
        <p className="text-muted-foreground">
          Première séance : {preview.firstOn}
          {preview.lastOn && preview.lastOn !== preview.firstOn ? ` · dernière : ${preview.lastOn}` : ""}.
        </p>
      )}
      {preview.coTrainerRemoved > 0 && (
        <p className="text-muted-foreground">
          Co-animation retirée sur {seances(preview.coTrainerRemoved)} : {who} {preview.coTrainerRemoved > 1 ? "les anime" : "l'anime"} désormais.
        </p>
      )}
      {preview.warnings.map((w) => (
        <p key={w} className="text-amber-700">⚠️ {w}</p>
      ))}
      {preview.conflicts.length > 0 && (
        <p className="text-muted-foreground">
          Les séances à régler se changent une par une dans le{" "}
          <Link href="/planning" className="underline">Planning</Link> (ou « Remplacements » pour les 3 prochaines semaines).
        </p>
      )}
      <p className="text-muted-foreground">
        Les séances passées, annulées ou à feuille clôturée ne changent pas.
        {preview.emailTo.length > 0 ? ` Un email part à ${joinNames(preview.emailTo)} (jours, horaires, lieu).` : ""}
        {preview.noEmail.length > 0 ? ` Pas d'email pour ${joinNames(preview.noEmail)} : aucune adresse sur la fiche.` : ""}
        {preview.assign > 0 ? " Les agendas Google suivent après la synchronisation de la nuit." : ""}
      </p>
    </div>
  );
}

/** Bouton « Changer de formateur » (ou « Choisir un formateur ») de la carte Formateur. */
export function TrainerChangeDialog({
  groupId,
  groupName,
  currentTrainerName,
  trainers,
  today,
}: {
  groupId: string;
  groupName: string;
  currentTrainerName: string | null;
  trainers: TrainerChoice[];
  today: string; // 'YYYY-MM-DD' (Paris)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trainerId, setTrainerId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [preview, setPreview] = useState<TrainerChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const lastRequest = useRef(0);
  const action = currentTrainerName ? "Changer de formateur" : "Choisir un formateur";

  // Aperçu recalculé à chaque choix (personne ou date) : rien n'est écrit.
  function refresh(nextTrainer: string, nextDate: string) {
    setPreview(null);
    setPreviewError(null);
    if (!nextTrainer || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    const request = ++lastRequest.current;
    startLoading(async () => {
      const result = await previewTrainerChange({ groupId, trainerId: nextTrainer, effectiveFrom: nextDate });
      if (request !== lastRequest.current) return; // une réponse plus récente arrive
      if (result.ok) setPreview(result.preview);
      else setPreviewError(result.error);
    });
  }

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTrainerId("");
      setEffectiveFrom(today);
      setPreview(null);
      setPreviewError(null);
    }
  }

  function submit() {
    startSaving(async () => {
      const result = await applyTrainerChange({ groupId, trainerId, effectiveFrom });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message, result.leftover.length
        ? { description: result.leftover.map((c) => `${c.when} : ${c.reason}`).join(" · "), duration: 12_000 }
        : undefined);
      reset(false);
      router.refresh();
    });
  }

  const confirmLabel = preview && preview.assign > 0
    ? `Confier ${seances(preview.assign)} à ${preview.trainerFirstName}`
    : "Valider le changement";

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs">
          <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
          {action}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{action} — {groupName}</DialogTitle>
          <DialogDescription>
            La personne choisie anime le groupe pour toutes les séances à venir. Aujourd&apos;hui : {currentTrainerName ?? "Non affecté"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Nouvelle personne</Label>
              <Select
                value={trainerId}
                onValueChange={(v) => {
                  setTrainerId(v);
                  refresh(v, effectiveFrom);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Choisir dans l'équipe…" /></SelectTrigger>
                <SelectContent>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trainer-change-from">À partir du</Label>
              <Input
                id="trainer-change-from"
                type="date"
                min={today}
                value={effectiveFrom}
                onChange={(e) => {
                  setEffectiveFrom(e.target.value);
                  refresh(trainerId, e.target.value);
                }}
              />
            </div>
          </div>
          {loading && <p className="text-sm text-muted-foreground">Vérification du planning…</p>}
          {!loading && previewError && <p className="text-sm text-destructive">{previewError}</p>}
          {!loading && preview && <TrainerChangeSummary preview={preview} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => reset(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={!preview || loading || saving}>
              {saving ? "Enregistrement…" : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

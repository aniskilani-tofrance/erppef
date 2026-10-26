"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { clearMeetingConvocations, spaceMeetingConvocations } from "@/app/(app)/apprenants/admission/actions";
import { MAX_STEP_MINUTES, MIN_STEP_MINUTES, spreadTimes, type SpacingOrder } from "@/lib/admission/convocation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// « Espacer les heures » : une heure de convocation par personne, une toutes les N minutes
// (test oral individuel échelonné). On voit tout de suite la dernière heure avant d'appliquer.
export function SpaceConvocationsDialog({
  meetingId,
  meetingTime,
  count,
  customCount,
}: {
  meetingId: string;
  meetingTime: string; // « HH:MM », heure de la réunion
  count: number; // personnes à placer (à envoyer, envoyée, confirmée)
  customCount: number; // convocations qui ont déjà une heure propre
}) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(meetingTime);
  const [minutes, setMinutes] = useState("15");
  const [order, setOrder] = useState<SpacingOrder>("inscription");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const step = Number(minutes);
  const preview = count > 0 ? spreadTimes(first, step, count) : null;

  function apply() {
    startTransition(async () => {
      const result = await spaceMeetingConvocations({ meetingId, firstTime: first, minutes: step, order });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.count} convocation${result.count > 1 ? "s" : ""} placée${result.count > 1 ? "s" : ""} de ${result.first.replace(":", "h")} à ${result.last.replace(":", "h")}.`,
      );
      if (result.afterEnd) toast.warning("La dernière heure dépasse la fin de la réunion.");
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    if (!window.confirm("Remettre tout le monde à l'heure de la réunion ?")) return;
    startTransition(async () => {
      const result = await clearMeetingConvocations(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tout le monde est à l'heure de la réunion.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="mr-1.5 h-4 w-4" />
          Espacer les heures
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Une heure de convocation par personne</DialogTitle>
          <DialogDescription>
            Pour le test oral individuel : chaque convoqué reçoit sa propre heure, la première à l&apos;heure de départ, puis une toutes les N minutes. Les présents, absents et excusés sont laissés de côté. Vous pouvez ensuite changer l&apos;heure d&apos;une personne.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-first">Première heure</Label>
              <Input id="space-first" type="time" value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-minutes">Minutes par personne</Label>
              <Input
                id="space-minutes"
                type="number"
                min={MIN_STEP_MINUTES}
                max={MAX_STEP_MINUTES}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ordre de passage</Label>
            <Select value={order} onValueChange={(v) => setOrder(v as SpacingOrder)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inscription">Ordre d&apos;inscription (le premier inscrit passe en premier)</SelectItem>
                <SelectItem value="alphabetique">Ordre alphabétique (nom)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            {count === 0
              ? "Aucun convoqué à placer pour l'instant."
              : preview?.ok
                ? `${count} personne${count > 1 ? "s" : ""} : de ${preview.times[0].replace(":", "h")} à ${preview.times[preview.times.length - 1].replace(":", "h")}.`
                : preview?.error}
          </p>
          <div className="flex flex-wrap justify-between gap-2">
            {customCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
                Tout remettre à l&apos;heure de la réunion
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={apply} disabled={pending || count === 0 || !preview?.ok}>
                {pending ? "Enregistrement…" : "Appliquer"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

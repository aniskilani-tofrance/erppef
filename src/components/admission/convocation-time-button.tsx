"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { setInvitationConvocation } from "@/app/(app)/apprenants/admission/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Heure de convocation d'une personne, sur sa ligne de la page de la réunion : « 14h20 » si elle a
// sa propre heure, sinon l'heure de la réunion en gris. Le message WhatsApp, l'email et le
// rappel de la veille utilisent cette heure.
export function ConvocationTimeButton({
  invitationId,
  learnerName,
  meetingTime,
  custom,
}: {
  invitationId: string;
  learnerName: string;
  meetingTime: string; // « HH:MM », heure de la réunion
  custom: string | null; // « HH:MM », heure propre à la personne
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(custom ?? meetingTime);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(time: string | null) {
    startTransition(async () => {
      const result = await setInvitationConvocation({ invitationId, time });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(time ? "Heure de convocation enregistrée." : "Retour à l'heure de la réunion.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setValue(custom ?? meetingTime);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={custom ? "h-6 px-1.5 text-xs font-semibold text-teal-800" : "h-6 px-1.5 text-xs font-normal text-muted-foreground"}
          title={custom ? "Heure de convocation propre à cette personne — modifier" : "Heure de la réunion — donner une heure propre à cette personne"}
        >
          <Clock className="mr-1 h-3 w-3" />
          {custom ? custom.replace(":", "h") : `${meetingTime.replace(":", "h")} · réunion`}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Heure de convocation — {learnerName}</DialogTitle>
          <DialogDescription>
            Le même jour que la réunion. Elle part dans le message WhatsApp, l&apos;email et le rappel de la veille.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`convocation-${invitationId}`}>Heure</Label>
            <Input id={`convocation-${invitationId}`} type="time" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={pending || !custom}>
              Heure de la réunion ({meetingTime.replace(":", "h")})
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={() => save(value)} disabled={pending || !value}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

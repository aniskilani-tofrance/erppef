"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff } from "lucide-react";
import { requestAbsence } from "@/app/(app)/conges/actions";
import { KIND_LABELS, needsApproval, requestWording, type AbsenceKind, type ContractType } from "@/lib/conges/rules";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Formateur : demander un congé (salarié → validation) ou déclarer une absence
// (vacataire / prestataire → enregistrée). La coordination est prévenue par email.
export function AbsenceRequestDialog({ contract }: { contract: ContractType }) {
  const [open, setOpen] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("conge");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wording = requestWording(contract);

  function submit() {
    startTransition(async () => {
      const result = await requestAbsence({ startsOn, endsOn: endsOn || startsOn, kind, note: note.trim() || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message || wording.done, { duration: 8000 });
      setOpen(false);
      setStartsOn(""); setEndsOn(""); setNote(""); setKind("conge");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarOff className="mr-2 h-4 w-4" />
          {wording.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{wording.button}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {needsApproval(contract)
              ? "Votre demande sera validée par la coordination. Vous recevez la réponse par email."
              : "Votre absence est enregistrée tout de suite ; la coordination est prévenue et déplace vos séances si besoin."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Du</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Au (inclus)</Label>
              <Input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} placeholder="même jour" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motif</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AbsenceKind)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as AbsenceKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Précision (optionnel)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Rendez-vous médical le matin, retour possible l'après-midi…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !startsOn}>{pending ? "Envoi…" : needsApproval(contract) ? "Envoyer la demande" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

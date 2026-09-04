"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { deleteInfoMeeting, upsertInfoMeeting } from "@/app/(app)/apprenants/admission/actions";
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

export type MeetingFormValues = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD (heure de Paris)
  startTime: string; // HH:MM
  endTime: string; // "" = non renseignée
  roomId: string; // "none" = pas de salle
  location: string;
  capacity: string; // "" = illimitée
  notes: string;
};

const EMPTY: MeetingFormValues = {
  title: "Réunion d'information",
  date: "",
  startTime: "14:00",
  endTime: "16:00",
  roomId: "none",
  location: "",
  capacity: "",
  notes: "",
};

// Création / modification d'une réunion d'information. À la création, on arrive
// directement sur la page de la réunion pour ajouter les convoqués.
export function MeetingFormDialog({
  rooms,
  initial,
  invitedCount = 0,
}: {
  rooms: { id: string; name: string }[];
  initial?: MeetingFormValues;
  invitedCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MeetingFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const set = <K extends keyof MeetingFormValues>(key: K, v: MeetingFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  function submit() {
    startTransition(async () => {
      const result = await upsertInfoMeeting({
        id: values.id,
        title: values.title.trim(),
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime || null,
        roomId: values.roomId === "none" ? null : values.roomId,
        location: values.location.trim() || null,
        capacity: values.capacity.trim() ? Number(values.capacity) : null,
        notes: values.notes.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Réunion mise à jour." : "Réunion créée — ajoutez maintenant les convoqués.");
      setOpen(false);
      if (isEdit) router.refresh();
      else router.push(`/apprenants/reunions/${result.id}`);
    });
  }

  function remove() {
    if (!initial?.id) return;
    if (invitedCount > 0 && !window.confirm(`Supprimer cette réunion et ses ${invitedCount} convocation${invitedCount > 1 ? "s" : ""} ?`)) return;
    startTransition(async () => {
      const result = await deleteInfoMeeting(initial.id!);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Réunion supprimée.");
      setOpen(false);
      router.push("/apprenants/admission");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Modifier
          </Button>
        ) : (
          <Button size="sm">
            <CalendarPlus className="mr-2 h-4 w-4" />
            Nouvelle réunion
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la réunion" : "Nouvelle réunion d'information"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Début</Label>
              <Input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin (optionnel)</Label>
              <Input type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Salle</Label>
              <Select value={values.roomId} onValueChange={(v) => set("roomId", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pas de salle / ailleurs</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Capacité (optionnel)</Label>
              <Input type="number" min={1} value={values.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="20" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lieu / adresse (dans le message envoyé)</Label>
            <Input
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="1 place Martin Levasseur, Saint-Ouen — 1er étage"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes internes (optionnel)</Label>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Ordre du jour, qui anime, documents à apporter…" />
          </div>
          <div className="flex justify-between gap-2">
            {isEdit ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-destructive">
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Supprimer
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={submit} disabled={pending || !values.title.trim() || !values.date || !values.startTime}>
                {pending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer la réunion"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

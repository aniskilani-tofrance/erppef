"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createSession } from "@/app/(app)/planning/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";

type Option = { id: string; name: string };
export type GroupOption = { id: string; name: string; trainerId: string | null; roomId: string | null };

const NONE = "none";

// Création d'une séance ponctuelle depuis un créneau sélectionné dans le planning.
export function SessionCreateDialog({
  slot,
  groups,
  trainers,
  rooms,
  onClose,
  onCreated,
}: {
  slot: { startsAt: string; endsAt: string } | null;
  groups: GroupOption[];
  trainers: Option[];
  rooms: Option[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [trainerId, setTrainerId] = useState(NONE);
  const [roomId, setRoomId] = useState(NONE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (slot) {
      setGroupId("");
      setTrainerId(NONE);
      setRoomId(NONE);
    }
  }, [slot]);

  // Sélection d'un groupe : préremplit formateur et salle habituels du groupe.
  function selectGroup(id: string) {
    setGroupId(id);
    const g = groups.find((x) => x.id === id);
    if (g) {
      setTrainerId(g.trainerId ?? NONE);
      setRoomId(g.roomId ?? NONE);
    }
  }

  function submit() {
    if (!slot || !groupId) return;
    startTransition(async () => {
      const result = await createSession({
        groupId,
        trainerId: trainerId === NONE ? null : trainerId,
        roomId: roomId === NONE ? null : roomId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Séance ajoutée au planning.");
      onCreated();
    });
  }

  if (!slot) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle séance ponctuelle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {new Date(slot.startsAt).toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              timeZone: "Europe/Paris",
            })}{" "}
            · {utcToLocalTime(slot.startsAt)} – {utcToLocalTime(slot.endsAt)}
            {" "}({utcToLocalDate(slot.startsAt)})
          </p>
          <div className="space-y-2">
            <Label>Groupe</Label>
            <Select value={groupId} onValueChange={selectGroup}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir un groupe" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Formateur</Label>
              <Select value={trainerId} onValueChange={setTrainerId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Salle</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !groupId}>
              {pending ? "Création…" : "Créer la séance"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

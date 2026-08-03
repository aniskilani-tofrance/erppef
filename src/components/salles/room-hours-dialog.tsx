"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Plus, Trash2 } from "lucide-react";
import { setRoomAvailabilities } from "@/app/(app)/salles/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type RoomSlot = { weekday: number; start: string; end: string };

const DAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Horaires d'ouverture d'une salle. Aucun créneau = ouverte sur les horaires de
// l'organisme ; sinon, le moteur n'y placera des séances QUE dans ces fenêtres.
export function RoomHoursDialog({ roomId, roomName, initial }: { roomId: string; roomName: string; initial: RoomSlot[] }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<RoomSlot[]>(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setRoomAvailabilities({ roomId, slots });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        slots.length
          ? "Horaires d'ouverture enregistrés : le moteur les respectera."
          : "Horaires effacés : salle ouverte sur les horaires de l'organisme.",
      );
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          Horaires
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Horaires d&apos;ouverture — {roomName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sans créneau, la salle suit les horaires de l&apos;organisme (9h-12h / 13h-20h).
            Avec des créneaux, le moteur et le planning ne l&apos;utiliseront que dans ces fenêtres.
          </p>
          <div className="space-y-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={String(slot.weekday)}
                  onValueChange={(v) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, weekday: Number(v) } : x)))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((d) => (
                      <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time" className="w-28" value={slot.start} step={900}
                  onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                />
                <span className="text-sm text-muted-foreground">→</span>
                <Input
                  type="time" className="w-28" value={slot.end} step={900}
                  onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                />
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setSlots((s) => s.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline" size="sm"
              onClick={() => setSlots((s) => [...s, { weekday: 1, start: "09:00", end: "12:00" }])}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Ajouter un créneau
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

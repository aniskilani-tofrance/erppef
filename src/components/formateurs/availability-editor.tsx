"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setAvailabilities } from "@/app/(app)/formateurs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

type Slot = { weekday: number; start: string; end: string };

const JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function AvailabilityEditor({ trainerId, initial }: { trainerId: string; initial: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<Slot>) {
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
    setDirty(true);
  }

  function add() {
    setSlots((s) => [...s, { weekday: 1, start: "09:00", end: "12:00" }]);
    setDirty(true);
  }

  function remove(index: number) {
    setSlots((s) => s.filter((_, i) => i !== index));
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      const result = await setAvailabilities({ trainerId, slots });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Disponibilités enregistrées.");
      setDirty(false);
    });
  }

  return (
    <div className="space-y-3">
      {slots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune disponibilité : le moteur ne proposera jamais ce formateur.
        </p>
      )}
      {slots.map((slot, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select value={String(slot.weekday)} onValueChange={(v) => update(i, { weekday: Number(v) })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {JOURS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="time" className="w-28" value={slot.start} onChange={(e) => update(i, { start: e.target.value })} />
          <span className="text-muted-foreground">→</span>
          <Input type="time" className="w-28" value={slot.end} onChange={(e) => update(i, { end: e.target.value })} />
          <Button variant="ghost" size="icon" onClick={() => remove(i)}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Ajouter un créneau
        </Button>
        {dirty && (
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </div>
    </div>
  );
}

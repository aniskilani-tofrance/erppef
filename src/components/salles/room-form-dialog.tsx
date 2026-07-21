"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertRoom } from "@/app/(app)/salles/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil } from "lucide-react";

type RoomFormValues = {
  id?: string;
  name: string;
  capacity: string;
  equipment: string;
  isActive: boolean;
};

const EMPTY: RoomFormValues = { name: "", capacity: "12", equipment: "", isActive: true };

export function RoomFormDialog({ initial }: { initial?: RoomFormValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<RoomFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function submit() {
    startTransition(async () => {
      const result = await upsertRoom({
        id: values.id,
        name: values.name,
        capacity: Number(values.capacity),
        equipment: values.equipment.split(",").map((s) => s.trim()).filter(Boolean),
        isActive: values.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Salle mise à jour." : "Salle créée.");
      setOpen(false);
      if (!isEdit) setValues(EMPTY);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle salle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la salle" : "Nouvelle salle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="Salle 14" />
          </div>
          <div className="space-y-2">
            <Label>Capacité (places)</Label>
            <Input type="number" min="1" value={values.capacity} onChange={(e) => setValues((v) => ({ ...v, capacity: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Équipements (séparés par des virgules)</Label>
            <Input value={values.equipment} onChange={(e) => setValues((v) => ({ ...v, equipment: e.target.value }))} placeholder="vidéoprojecteur, tableau blanc" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.isActive} onCheckedChange={(c) => setValues((v) => ({ ...v, isActive: c === true }))} />
            Active (réservable par le moteur)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.name}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

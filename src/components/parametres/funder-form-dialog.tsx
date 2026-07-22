"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertFunder } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil } from "lucide-react";

export type FunderFormValues = {
  id?: string;
  name: string;
  code: string;
  color: string;
  isActive: boolean;
};

const EMPTY: FunderFormValues = { name: "", code: "", color: "#2563eb", isActive: true };

export function FunderFormDialog({ initial }: { initial?: FunderFormValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FunderFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function submit() {
    startTransition(async () => {
      const result = await upsertFunder({
        id: values.id,
        name: values.name,
        code: values.code,
        color: values.color,
        isActive: values.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Financeur mis à jour." : "Financeur créé.");
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
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau financeur
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le financeur" : "Nouveau financeur"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="Ville de Saint-Ouen" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={values.code} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} placeholder="VILLE" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Couleur du planning</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={values.color}
                onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
                className="h-9 w-14 cursor-pointer rounded border bg-background p-1"
              />
              <span className="text-sm text-muted-foreground">{values.color}</span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.isActive} onCheckedChange={(c) => setValues((v) => ({ ...v, isActive: c === true }))} />
            Actif
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.name || !values.code}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

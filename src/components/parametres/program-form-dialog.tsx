"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertProgram } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";

export type ProgramFormValues = {
  id?: string;
  code: string;
  name: string;
  totalHours: string;
  defaultWeeklyHours: string;
  defaultFunderId: string;
  level: string;
  modality: "presentiel" | "distanciel" | "hybride";
  isActive: boolean;
};

const EMPTY: ProgramFormValues = {
  code: "",
  name: "",
  totalHours: "",
  defaultWeeklyHours: "",
  defaultFunderId: "none",
  level: "",
  modality: "presentiel",
  isActive: true,
};

const LEVELS = ["A1.1", "A1", "A2", "B1", "B2"];

export function ProgramFormDialog({
  initial,
  funders,
}: {
  initial?: ProgramFormValues;
  funders: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProgramFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertProgram({
        id: values.id,
        code: values.code,
        name: values.name,
        totalHours: Number(values.totalHours),
        defaultWeeklyHours: values.defaultWeeklyHours ? Number(values.defaultWeeklyHours) : null,
        defaultFunderId: values.defaultFunderId === "none" ? null : values.defaultFunderId,
        level: values.level === "none" || !values.level ? null : values.level,
        modality: values.modality,
        isActive: values.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Dispositif mis à jour." : "Dispositif créé.");
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
            Nouveau dispositif
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le dispositif" : "Nouveau dispositif"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={values.code} onChange={(e) => set("code", e.target.value)} placeholder="PEF-A1" />
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="PEF A1" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Volume total (heures)</Label>
              <Input type="number" min="1" step="0.5" value={values.totalHours} onChange={(e) => set("totalHours", e.target.value)} placeholder="300" />
            </div>
            <div className="space-y-2">
              <Label>Rythme par défaut (h/semaine)</Label>
              <Input type="number" min="1" step="0.5" value={values.defaultWeeklyHours} onChange={(e) => set("defaultWeeklyHours", e.target.value)} placeholder="15" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Niveau visé</Label>
              <Select value={values.level || "none"} onValueChange={(v) => set("level", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modalité</Label>
              <Select value={values.modality} onValueChange={(v) => set("modality", v as ProgramFormValues["modality"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presentiel">Présentiel</SelectItem>
                  <SelectItem value="distanciel">Distanciel</SelectItem>
                  <SelectItem value="hybride">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Financeur par défaut</Label>
            <Select value={values.defaultFunderId} onValueChange={(v) => set("defaultFunderId", v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {funders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.isActive} onCheckedChange={(c) => set("isActive", c === true)} />
            Actif (proposé dans le wizard de groupe)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.code || !values.name || !values.totalHours}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

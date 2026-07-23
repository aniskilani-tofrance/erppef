"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertTrainer } from "@/app/(app)/formateurs/actions";
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

export type TrainerFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  contractType: "salarie" | "vacataire";
  hourlyCost: string;
  weeklyHoursMax: string;
  priority: string;
  skills: string;
  languages: string;
  isActive: boolean;
};

const EMPTY: TrainerFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  contractType: "salarie",
  hourlyCost: "",
  weeklyHoursMax: "35",
  priority: "10",
  skills: "FLE",
  languages: "fr",
  isActive: true,
};

export function TrainerFormDialog({ initial }: { initial?: TrainerFormValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<TrainerFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof TrainerFormValues>(key: K, value: TrainerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertTrainer({
        id: values.id,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email || null,
        phone: values.phone || null,
        contractType: values.contractType,
        hourlyCost: Number(values.hourlyCost),
        weeklyHoursMax: Number(values.weeklyHoursMax),
        priority: Number(values.priority),
        skills: values.skills.split(",").map((s) => s.trim()).filter(Boolean),
        languages: values.languages.split(",").map((s) => s.trim()).filter(Boolean),
        isActive: values.isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (isEdit) {
        toast.success("Formateur mis à jour.");
      } else {
        const suffix = {
          envoyee: " Invitation envoyée par email : il pourra se connecter à l'ERP.",
          compte_existant: " Un compte existait déjà : accès formateur rattaché.",
          echec: " ⚠️ L'invitation par email a échoué — réessayez depuis sa fiche.",
          sans_email: " Ajoutez un email pour l'inviter à se connecter.",
        }[result.invitation];
        toast.success(`Formateur créé.${suffix}`);
      }
      setOpen(false);
      if (!isEdit) setValues(EMPTY);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Modifier
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau formateur
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le formateur" : "Nouveau formateur"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom">
              <Input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label="Nom">
              <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contrat">
              <Select
                value={values.contractType}
                onValueChange={(v) => set("contractType", v as "salarie" | "vacataire")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salarie">Salarié</SelectItem>
                  <SelectItem value="vacataire">Vacataire</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Coût horaire chargé (€)">
              <Input type="number" step="0.5" value={values.hourlyCost} onChange={(e) => set("hourlyCost", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Heures max / semaine">
              <Input type="number" step="0.5" value={values.weeklyHoursMax} onChange={(e) => set("weeklyHoursMax", e.target.value)} />
            </Field>
            <Field label="Priorité (1 = premier choix)">
              <Input type="number" min="1" value={values.priority} onChange={(e) => set("priority", e.target.value)} />
            </Field>
          </div>
          <Field label="Compétences (séparées par des virgules)">
            <Input value={values.skills} onChange={(e) => set("skills", e.target.value)} placeholder="FLE, alphabétisation, préparation examen" />
          </Field>
          <Field label="Langues (séparées par des virgules)">
            <Input value={values.languages} onChange={(e) => set("languages", e.target.value)} placeholder="fr, ar, en" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.isActive} onCheckedChange={(c) => set("isActive", c === true)} />
            Actif (proposable par le moteur)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.firstName || !values.hourlyCost}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertLearner } from "@/app/(app)/apprenants/actions";
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
import { Plus, Pencil } from "lucide-react";
import { PhotoUpload, initials } from "@/components/ui/photo-upload";

export type LearnerFormValues = {
  id?: string;
  photoUrl: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  firstLanguage: string;
  levelAssessed: string;
  franceTravailId: string;
  notes: string;
};

const EMPTY: LearnerFormValues = {
  photoUrl: null,
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  firstLanguage: "",
  levelAssessed: "",
  franceTravailId: "",
  notes: "",
};

const LEVELS = ["Non évalué", "A1.1", "A1", "A2", "B1", "B2"];

export function LearnerFormDialog({
  initial,
  groups = [],
  defaultGroupId,
  triggerLabel = "Nouvel apprenant",
}: {
  initial?: LearnerFormValues;
  // Groupes proposés pour l'inscription directe à la création (flux « créer et inscrire »).
  groups?: { id: string; name: string }[];
  defaultGroupId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<LearnerFormValues>(initial ?? EMPTY);
  const [groupId, setGroupId] = useState(defaultGroupId ?? "none");
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function set<K extends keyof LearnerFormValues>(key: K, value: LearnerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertLearner({
        id: values.id,
        photoUrl: values.photoUrl,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        firstLanguage: values.firstLanguage.trim() || null,
        levelAssessed: values.levelAssessed === "Non évalué" || !values.levelAssessed ? null : values.levelAssessed,
        franceTravailId: values.franceTravailId.trim() || null,
        notes: values.notes.trim() || null,
        enrollGroupId: !isEdit && groupId !== "none" ? groupId : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isEdit
          ? "Apprenant mis à jour."
          : groupId !== "none"
            ? "Apprenant créé et inscrit au groupe."
            : "Apprenant créé.",
      );
      setOpen(false);
      if (!isEdit) {
        setValues(EMPTY);
        setGroupId(defaultGroupId ?? "none");
      }
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
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'apprenant" : "Nouvel apprenant"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <PhotoUpload
            url={values.photoUrl}
            fallback={initials(`${values.firstName} ${values.lastName}`) || "?"}
            folder="apprenants"
            onChange={(url) => set("photoUrl", url)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Prénom</Label>
              <Input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Langue première</Label>
              <Input value={values.firstLanguage} onChange={(e) => set("firstLanguage", e.target.value)} placeholder="arabe, dari, turc…" />
            </div>
            <div className="space-y-2">
              <Label>Niveau évalué</Label>
              <Select value={values.levelAssessed || "Non évalué"} onValueChange={(v) => set("levelAssessed", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Identifiant France Travail</Label>
            <Input value={values.franceTravailId} onChange={(e) => set("franceTravailId", e.target.value)} />
          </div>
          {!isEdit && groups.length > 0 && (
            <div className="space-y-2">
              <Label>Inscrire directement dans un groupe</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pas d&apos;inscription pour l&apos;instant</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !values.firstName || !values.lastName}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

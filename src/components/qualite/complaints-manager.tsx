"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { upsertComplaint } from "@/app/(app)/qualite/actions";
import { Badge } from "@/components/ui/badge";
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

export type Complaint = {
  id: string;
  source: "apprenant" | "financeur" | "formateur" | "partenaire" | "autre";
  authorName: string | null;
  subject: string;
  details: string | null;
  receivedOn: string;
  status: "ouverte" | "en_cours" | "traitee";
  resolution: string | null;
};

const SOURCES = ["apprenant", "financeur", "formateur", "partenaire", "autre"] as const;
const STATUS: Record<Complaint["status"], { label: string; variant: "destructive" | "secondary" | "default" }> = {
  ouverte: { label: "Ouverte", variant: "destructive" },
  en_cours: { label: "En cours", variant: "secondary" },
  traitee: { label: "Traitée", variant: "default" },
};

export function ComplaintsManager({ complaints }: { complaints: Complaint[] }) {
  return (
    <div className="space-y-3">
      {complaints.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune réclamation enregistrée. Le registre vide est aussi une preuve : consignez
          chaque réclamation reçue, même mineure.
        </p>
      ) : (
        <ul className="space-y-2">
          {complaints.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(`${c.receivedOn}T12:00:00Z`).toLocaleDateString("fr-FR")} · {c.source}
                  {c.authorName ? ` · ${c.authorName}` : ""}
                  {c.resolution ? ` — ${c.resolution}` : ""}
                </p>
              </div>
              <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
              <ComplaintDialog initial={c} />
            </li>
          ))}
        </ul>
      )}
      <ComplaintDialog />
    </div>
  );
}

const EMPTY: Omit<Complaint, "id"> & { id?: string } = {
  source: "apprenant",
  authorName: "",
  subject: "",
  details: "",
  receivedOn: new Date().toISOString().slice(0, 10),
  status: "ouverte",
  resolution: "",
};

function ComplaintDialog({ initial }: { initial?: Complaint }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function submit() {
    startTransition(async () => {
      const result = await upsertComplaint({
        id: values.id,
        source: values.source,
        authorName: values.authorName?.trim() || null,
        subject: values.subject.trim(),
        details: values.details?.trim() || null,
        receivedOn: values.receivedOn,
        status: values.status,
        resolution: values.resolution?.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Réclamation mise à jour." : "Réclamation enregistrée au registre.");
      setOpen(false);
      if (!isEdit) setValues({ ...EMPTY });
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
            Nouvelle réclamation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Traiter la réclamation" : "Nouvelle réclamation"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={values.source} onValueChange={(v) => setValues((s) => ({ ...s, source: v as Complaint["source"] }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reçue le</Label>
              <Input type="date" value={values.receivedOn} onChange={(e) => setValues((s) => ({ ...s, receivedOn: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Auteur (optionnel)</Label>
            <Input value={values.authorName ?? ""} onChange={(e) => setValues((s) => ({ ...s, authorName: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Objet</Label>
            <Input value={values.subject} onChange={(e) => setValues((s) => ({ ...s, subject: e.target.value }))} placeholder="Salle trop bruyante, horaire inadapté…" />
          </div>
          <div className="space-y-2">
            <Label>Détails</Label>
            <Textarea value={values.details ?? ""} onChange={(e) => setValues((s) => ({ ...s, details: e.target.value }))} rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={values.status} onValueChange={(v) => setValues((s) => ({ ...s, status: v as Complaint["status"] }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ouverte">Ouverte</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="traitee">Traitée</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Action corrective / réponse apportée</Label>
            <Textarea value={values.resolution ?? ""} onChange={(e) => setValues((s) => ({ ...s, resolution: e.target.value }))} rows={2} placeholder="Ce champ est votre preuve de traitement (ind. 31-32)." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !values.subject}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { deleteWatchEntry, upsertWatchEntry } from "@/app/(app)/qualite/actions";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";

export type WatchEntry = {
  id: string;
  entryDate: string;
  category: "legale" | "metiers" | "pedagogique";
  source: string;
  url: string | null;
  summary: string;
  sharedWithTeam: boolean;
};

const CATEGORIES: Record<WatchEntry["category"], string> = {
  legale: "Légale & réglementaire",
  metiers: "Métiers & compétences",
  pedagogique: "Pédagogique & innovations",
};

export function WatchManager({ entries }: { entries: WatchEntry[] }) {
  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune entrée. L&apos;auditeur juge la régularité : une entrée par mois suffit —
          une source lue, deux lignes sur ce que vous en retenez.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {e.source}
                    </a>
                  ) : (
                    e.source
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(`${e.entryDate}T12:00:00Z`).toLocaleDateString("fr-FR")} — {e.summary}
                </p>
              </div>
              <Badge variant="secondary">{CATEGORIES[e.category]}</Badge>
              {e.sharedWithTeam && <Badge variant="outline">Diffusée</Badge>}
              <WatchDialog initial={e} />
            </li>
          ))}
        </ul>
      )}
      <WatchDialog />
    </div>
  );
}

// url en string (jamais null) : c'est l'état du formulaire, la conversion vers null se fait à l'envoi.
const EMPTY: Omit<WatchEntry, "id" | "url"> & { id?: string; url: string } = {
  entryDate: new Date().toISOString().slice(0, 10),
  category: "legale",
  source: "",
  url: "",
  summary: "",
  sharedWithTeam: false,
};

function WatchDialog({ initial }: { initial?: WatchEntry }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ ...EMPTY, ...initial, url: initial?.url ?? "" });
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function submit() {
    startTransition(async () => {
      const result = await upsertWatchEntry({
        id: values.id,
        entryDate: values.entryDate,
        category: values.category,
        source: values.source.trim(),
        url: values.url.trim() || null,
        summary: values.summary.trim(),
        sharedWithTeam: values.sharedWithTeam,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Entrée de veille mise à jour." : "Entrée ajoutée au registre de veille.");
      setOpen(false);
      if (!isEdit) setValues({ ...EMPTY });
    });
  }

  function remove() {
    if (!initial?.id) return;
    startTransition(async () => {
      const result = await deleteWatchEntry(initial.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Entrée supprimée.");
      setOpen(false);
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
            Nouvelle entrée de veille
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'entrée" : "Nouvelle entrée de veille"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type de veille</Label>
              <Select value={values.category} onValueChange={(v) => setValues((s) => ({ ...s, category: v as WatchEntry["category"] }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORIES) as WatchEntry["category"][]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORIES[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={values.entryDate} onChange={(e) => setValues((s) => ({ ...s, entryDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input value={values.source} onChange={(e) => setValues((s) => ({ ...s, source: e.target.value }))} placeholder="Centre Inffo, DGEFP, Le français dans le monde…" />
          </div>
          <div className="space-y-2">
            <Label>Lien (optionnel)</Label>
            <Input value={values.url} onChange={(e) => setValues((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" />
          </div>
          <div className="space-y-2">
            <Label>Ce qu&apos;on en retient</Label>
            <Textarea
              value={values.summary}
              onChange={(e) => setValues((s) => ({ ...s, summary: e.target.value }))}
              rows={2}
              placeholder="Deux lignes suffisent : la nouveauté, et ce qu'elle change (ou pas) pour nous."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.sharedWithTeam}
              onCheckedChange={(c) => setValues((s) => ({ ...s, sharedWithTeam: c === true }))}
            />
            Diffusée à l&apos;équipe (réunion, mail…) — preuve d&apos;exploitation de la veille
          </label>
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
              <Button onClick={submit} disabled={pending || !values.source.trim() || !values.summary.trim()}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
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
import { CATEGORY_LABELS, VEILLE_CATEGORIES, VEILLE_INDICATORS, type VeilleCategory } from "@/lib/veille/schema";

export type WatchStatus = "a_valider" | "validee" | "ecartee";

export type WatchEntry = {
  id: string;
  entryDate: string;
  category: VeilleCategory;
  source: string;
  url: string | null;
  summary: string;
  sharedWithTeam: boolean;
  title: string | null;
  status: WatchStatus;
  origin: "manuel" | "collecteur";
  indicator: number | null;
  alert: boolean;
  impact: string | null;
  exploitation: string | null;
  publishedOn: string | null;
  runId: string | null;
};

const STATUS_LABELS: Record<WatchStatus, string> = {
  a_valider: "À valider",
  validee: "Validée",
  ecartee: "Écartée",
};

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR");
}

// Registre de veille : saisies manuelles de l'équipe + fiches déposées chaque semaine
// par le collecteur (statut « À valider » jusqu'à relecture). Le filtre « À valider »
// est le point d'entrée de la relecture hebdomadaire.
export function WatchManager({ entries }: { entries: WatchEntry[] }) {
  const [onlyPending, setOnlyPending] = useState(false);
  const pending = entries.filter((e) => e.status === "a_valider").length;
  const shown = onlyPending ? entries.filter((e) => e.status === "a_valider") : entries;

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {entries.length} entrée{entries.length > 1 ? "s" : ""}
            {pending > 0 ? ` · ${pending} à valider` : ""}
          </span>
          {pending > 0 && (
            <Button variant={onlyPending ? "secondary" : "outline"} size="sm" onClick={() => setOnlyPending((v) => !v)}>
              {onlyPending ? "Tout afficher" : `À valider (${pending})`}
            </Button>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {entries.length === 0
            ? "Aucune entrée. L'auditeur juge la régularité : une entrée par mois suffit — une source lue, deux lignes sur ce que vous en retenez. Le collecteur de veille dépose aussi ses fiches ici chaque semaine."
            : "Aucune fiche à valider."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {e.title ?? e.source}
                    </a>
                  ) : (
                    e.title ?? e.source
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(e.entryDate)}{e.title ? ` · ${e.source}` : ""} — {e.summary}
                </p>
              </div>
              {e.alert && (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Alerte
                </Badge>
              )}
              {e.status !== "validee" && (
                <Badge variant="outline" className={e.status === "a_valider" ? "border-amber-300 bg-amber-50 text-amber-800" : "text-muted-foreground"}>
                  {STATUS_LABELS[e.status]}
                </Badge>
              )}
              {e.indicator && <Badge variant="outline">ind. {e.indicator}</Badge>}
              <Badge variant="secondary">{CATEGORY_LABELS[e.category]}</Badge>
              {e.origin === "collecteur" && <Badge variant="outline">Collecteur</Badge>}
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

type FormValues = {
  id?: string;
  entryDate: string;
  category: VeilleCategory;
  source: string;
  url: string;
  summary: string;
  sharedWithTeam: boolean;
  title: string;
  status: WatchStatus;
  indicator: string; // "" = aucun
  alert: boolean;
  impact: string;
  exploitation: string;
  publishedOn: string;
  origin: "manuel" | "collecteur";
};

const EMPTY: FormValues = {
  entryDate: new Date().toISOString().slice(0, 10),
  category: "legale",
  source: "",
  url: "",
  summary: "",
  sharedWithTeam: false,
  title: "",
  status: "validee",
  indicator: "",
  alert: false,
  impact: "",
  exploitation: "",
  publishedOn: "",
  origin: "manuel",
};

function fromEntry(e: WatchEntry): FormValues {
  return {
    id: e.id,
    entryDate: e.entryDate,
    category: e.category,
    source: e.source,
    url: e.url ?? "",
    summary: e.summary,
    sharedWithTeam: e.sharedWithTeam,
    title: e.title ?? "",
    status: e.status,
    indicator: e.indicator ? String(e.indicator) : "",
    alert: e.alert,
    impact: e.impact ?? "",
    exploitation: e.exploitation ?? "",
    publishedOn: e.publishedOn ?? "",
    origin: e.origin,
  };
}

function WatchDialog({ initial }: { initial?: WatchEntry }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(initial ? fromEntry(initial) : { ...EMPTY });
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);
  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => setValues((s) => ({ ...s, [key]: v }));

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
        title: values.title.trim() || null,
        status: values.status,
        indicator: values.indicator ? Number(values.indicator) : null,
        alert: values.alert,
        impact: values.impact.trim() || null,
        exploitation: values.exploitation.trim() || null,
        publishedOn: values.publishedOn || null,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (values.origin === "collecteur" ? "Fiche du collecteur de veille" : "Modifier l'entrée") : "Nouvelle entrée de veille"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type de veille</Label>
              <Select value={values.category} onValueChange={(v) => set("category", v as VeilleCategory)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEILLE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Indicateur Qualiopi</Label>
              <Select value={values.indicator || "none"} onValueChange={(v) => set("indicator", v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {VEILLE_INDICATORS.map((i) => (
                    <SelectItem key={i} value={String(i)}>ind. {i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date de lecture</Label>
              <Input type="date" value={values.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Titre (optionnel)</Label>
            <Input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Ce dont il s'agit, en une ligne" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source</Label>
              <Input value={values.source} onChange={(e) => set("source", e.target.value)} placeholder="Centre Inffo, DGEFP, Le français dans le monde…" />
            </div>
            <div className="space-y-2">
              <Label>Date de publication (optionnel)</Label>
              <Input type="date" value={values.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lien (optionnel)</Label>
            <Input value={values.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-2">
            <Label>Ce qu&apos;on en retient</Label>
            <Textarea
              value={values.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={2}
              placeholder="Deux lignes suffisent : la nouveauté, et ce qu'elle change (ou pas) pour nous."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Impact pour ParlerEmploi (optionnel)</Label>
              <Textarea value={values.impact} onChange={(e) => set("impact", e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Exploitation proposée (optionnel)</Label>
              <Textarea value={values.exploitation} onChange={(e) => set("exploitation", e.target.value)} rows={2} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={values.status} onValueChange={(v) => set("status", v as WatchStatus)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as WatchStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={values.alert} onCheckedChange={(c) => set("alert", c === true)} />
                Alerte (action ou échéance à ne pas manquer)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={values.sharedWithTeam} onCheckedChange={(c) => set("sharedWithTeam", c === true)} />
                Diffusée à l&apos;équipe — preuve d&apos;exploitation
              </label>
            </div>
          </div>
          {values.origin === "collecteur" && initial?.runId && (
            <p className="text-xs text-muted-foreground">Déposée par le collecteur de veille (exécution {initial.runId}). Relisez, puis passez en « Validée » ou « Écartée ».</p>
          )}
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

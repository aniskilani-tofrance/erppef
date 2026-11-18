"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, History, Loader2, Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptDraft, addSection, draftSection, figuresForPeriod, keepVersion, listVersions, restoreVersion, updateSection, type SectionVersion,
} from "@/app/(app)/financements/atelier-actions";
import {
  AI_MODES, AI_MODE_LABELS, BLOCK_CATEGORIES, BLOCK_CATEGORY_LABELS, countChars, modeNeedsText, type AiMode, type BlockCategory,
} from "@/lib/financements/atelier";
import type { FigurePeriod } from "@/lib/financements/chiffres";
import { cn } from "@/lib/utils";
import { Field } from "./champs";

export type BlockLite = { id: string; title: string; category: BlockCategory; content: string };
const NO_FIGURES = "__sans__";

function CharCount({ chars, max }: { chars: number; max: number | null }) {
  const over = !!max && chars > max;
  return (
    <span className={cn("text-xs tabular-nums", over ? "font-medium text-red-700" : "text-muted-foreground")}>
      {chars.toLocaleString("fr-FR")}
      {max ? ` / ${max.toLocaleString("fr-FR")}` : ""} caractères
    </span>
  );
}

// ── Écrire avec l'IA ─────────────────────────────────────────────────────────
// L'IA propose, la personne relit puis choisit : remplacer, ajouter à la suite, ou abandonner.
export function AiDraftDialog({
  sectionId, sectionTitle, maxChars, hasText, blocks, periods, beforeAsk, onAccepted,
}: {
  sectionId: string;
  sectionTitle: string;
  maxChars: number | null;
  hasText: boolean;
  blocks: BlockLite[];
  periods: FigurePeriod[];
  beforeAsk: () => Promise<boolean>; // enregistre le texte en cours avant l'appel
  onAccepted: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AiMode>("rediger");
  const [instruction, setInstruction] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>(NO_FIGURES);
  const [proposal, setProposal] = useState<{ text: string; remarks: string[]; chars: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    startTransition(async () => {
      if (!(await beforeAsk())) return;
      const r = await draftSection({
        sectionId, mode, instruction: instruction.trim() || null, blockIds: picked, periodKey: period === NO_FIGURES ? null : period,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setProposal({ text: r.text, remarks: r.remarks, chars: r.chars });
    });
  }

  function accept(how: "remplacer" | "ajouter") {
    if (!proposal) return;
    startTransition(async () => {
      const r = await acceptDraft(sectionId, proposal.text, how);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (r.data) onAccepted(r.data.content);
      setProposal(null);
      setOpen(false);
    });
  }

  const effectiveMode: AiMode = !hasText && modeNeedsText(mode) ? "rediger" : mode;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setProposal(null); }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm"><Sparkles className="h-3.5 w-3.5" />Écrire avec l&apos;IA</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Écrire avec l&apos;IA — {sectionTitle}</DialogTitle>
          <DialogDescription>L&apos;IA propose un texte, vous le relisez et vous décidez. Rien n&apos;est remplacé sans vous.</DialogDescription>
        </DialogHeader>

        {!proposal ? (
          <div className="space-y-4">
            <Field label="Que voulez-vous ?">
              <div className="flex flex-wrap gap-1.5">
                {AI_MODES.map((m) => {
                  const disabled = !hasText && modeNeedsText(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={effectiveMode === m ? "default" : "outline"}
                      disabled={disabled || pending}
                      title={disabled ? "Cette demande part du texte existant : la rubrique est vide." : undefined}
                      onClick={() => setMode(m)}
                    >
                      {AI_MODE_LABELS[m]}
                    </Button>
                  );
                })}
              </div>
            </Field>
            <Field label="Une précision ? (facultatif)" hint="Par exemple : « insister sur les femmes du quartier Cordon », « citer le partenariat avec la médiathèque ».">
              <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} maxLength={1000} disabled={pending} />
            </Field>
            {blocks.length > 0 && (
              <Field label="Textes de la bibliothèque à utiliser" hint="L'IA s'appuie sur ces textes et sur les autres rubriques du dossier. Elle n'invente pas de chiffres.">
                <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {blocks.map((b) => (
                    <label key={b.id} className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        checked={picked.includes(b.id)}
                        disabled={pending || (!picked.includes(b.id) && picked.length >= 12)}
                        onCheckedChange={(v) => setPicked((prev) => (v === true ? [...prev, b.id] : prev.filter((x) => x !== b.id)))}
                        className="mt-0.5"
                      />
                      <span>
                        {b.title} <span className="text-xs text-muted-foreground">· {BLOCK_CATEGORY_LABELS[b.category]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Chiffres de l'ERP à fournir" hint="Uniquement des totaux : nombre de personnes, heures, répartitions. Jamais de nom.">
              <Select value={period} onValueChange={setPeriod} disabled={pending}>
                <SelectTrigger className="w-full" aria-label="Période des chiffres"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FIGURES}>Aucun chiffre</SelectItem>
                  {periods.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {pending && <span className="mr-auto text-xs text-muted-foreground">L&apos;IA rédige : cela peut prendre une minute.</span>}
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button type="button" onClick={ask} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {pending ? "Rédaction…" : "Demander à l'IA"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Proposition</p>
              <CharCount chars={proposal.chars} max={maxChars} />
            </div>
            <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">{proposal.text}</div>
            {proposal.remarks.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">À vérifier avant de reprendre ce texte</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {proposal.remarks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setProposal(null)} disabled={pending}>Redemander</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Abandonner</Button>
              {hasText && <Button type="button" variant="outline" onClick={() => accept("ajouter")} disabled={pending}>Ajouter à la suite</Button>}
              <Button type="button" onClick={() => accept("remplacer")} disabled={pending}>{hasText ? "Remplacer mon texte" : "Reprendre ce texte"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Insérer un texte de la bibliothèque ou les chiffres de l'ERP ─────────────
export function InsertDialog({ blocks, periods, onInsert }: { blocks: BlockLite[]; periods: FigurePeriod[]; onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(periods[0]?.key ?? "");
  const [pending, startTransition] = useTransition();

  function insert(text: string, label: string) {
    onInsert(text);
    toast.success(`${label} : ajouté à la fin de la rubrique.`);
    setOpen(false);
  }
  function insertFigures() {
    startTransition(async () => {
      const r = await figuresForPeriod(period);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      insert(r.text, "Chiffres de l'ERP");
    });
  }

  const byCategory = BLOCK_CATEGORIES.map((c) => ({ category: c, items: blocks.filter((b) => b.category === c) })).filter((g) => g.items.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline"><BookOpen className="h-3.5 w-3.5" />Insérer</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Insérer dans la rubrique</DialogTitle>
          <DialogDescription>Le texte est ajouté à la fin de la rubrique. Vous le retouchez ensuite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Chiffres de l&apos;ERP</p>
            <p className="text-xs text-muted-foreground">Des totaux seulement : personnes accompagnées, heures, répartitions. Jamais de nom.</p>
            <div className="flex flex-wrap gap-2">
              <Select value={period} onValueChange={setPeriod} disabled={pending}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Période"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={insertFigures} disabled={pending || !period}>{pending ? "Calcul…" : "Insérer les chiffres"}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Bibliothèque de textes</p>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">La bibliothèque est vide. Ajoutez vos textes dans Financements → Bibliothèque : présentation de l&apos;association, description des actions, réponses déjà acceptées.</p>
            ) : (
              byCategory.map((g) => (
                <div key={g.category} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{BLOCK_CATEGORY_LABELS[g.category]}</p>
                  {g.items.map((b) => (
                    <div key={b.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{b.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{b.content}</p>
                        <p className="text-xs text-muted-foreground">{countChars(b.content).toLocaleString("fr-FR")} caractères</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => insert(b.content, b.title)}>Insérer</Button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Titre, consigne et limite d'une rubrique (création et modification) ──────
export function SectionFormDialog({
  applicationId, initial,
}: {
  applicationId: string;
  initial?: { id: string; title: string; guidance: string | null; max_chars: number | null };
}) {
  const edit = !!initial;
  const blankForm = { title: "", guidance: "", max_chars: "" };
  const fromInitial = () => (initial ? { title: initial.title, guidance: initial.guidance ?? "", max_chars: initial.max_chars ? String(initial.max_chars) : "" } : blankForm);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(fromInitial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = edit ? await updateSection(initial.id, f) : await addSection(applicationId, f);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      if (!edit) setF(blankForm);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromInitial()); }}>
      <DialogTrigger asChild>
        {edit ? (
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Modifier le titre, la consigne et la limite" title="Titre, consigne, limite"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button type="button" size="sm" variant="outline"><Plus className="h-4 w-4" />Ajouter une rubrique</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier la rubrique" : "Nouvelle rubrique"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titre *" hint="Le nom du champ dans le formulaire du financeur.">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} autoFocus placeholder="Objectifs de l'action" />
          </Field>
          <Field label="Ce que le financeur attend" hint="La consigne du formulaire ou le critère de l'appel. Elle guide aussi l'IA.">
            <Textarea value={f.guidance} onChange={(e) => setF({ ...f, guidance: e.target.value })} rows={3} maxLength={2000} />
          </Field>
          <Field label="Limite de caractères" hint="Celle du formulaire, espaces comprises. Laissez vide s'il n'y en a pas.">
            <Input inputMode="numeric" value={f.max_chars} onChange={(e) => setF({ ...f, max_chars: e.target.value })} placeholder="1500" maxLength={7} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.title.trim()}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Versions gardées d'une rubrique ──────────────────────────────────────────
export function VersionsDialog({
  sectionId, sectionTitle, beforeKeep, onRestored,
}: {
  sectionId: string;
  sectionTitle: string;
  beforeKeep: () => Promise<boolean>; // enregistre le texte en cours avant de le garder
  onRestored: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<SectionVersion[] | null>(null);
  const [pending, startTransition] = useTransition();

  function keep() {
    startTransition(async () => {
      if (!(await beforeKeep())) return;
      const r = await keepVersion(sectionId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      const list = await listVersions(sectionId);
      if (list.ok) setVersions(list.versions);
    });
  }

  function load() {
    setVersions(null);
    startTransition(async () => {
      const r = await listVersions(sectionId);
      if (!r.ok) {
        toast.error(r.error);
        setVersions([]);
        return;
      }
      setVersions(r.versions);
    });
  }
  function restore(id: string) {
    startTransition(async () => {
      const r = await restoreVersion(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (r.data) onRestored(r.data.content);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Versions gardées" title="Versions gardées"><History className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Versions gardées — {sectionTitle}</DialogTitle>
          <DialogDescription>Le texte d&apos;avant chaque proposition de l&apos;IA est gardé ici. Reprendre une version garde aussi le texte en place.</DialogDescription>
        </DialogHeader>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={keep} disabled={pending}>Garder le texte actuel</Button>
        </div>
        {versions === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune version gardée pour cette rubrique.</p>
        ) : (
          <ul className="space-y-3">
            {versions.map((v) => (
              <li key={v.id} className="space-y-1.5 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}
                    {" · "}
                    {v.source === "ia" ? "proposition de l'IA acceptée" : "texte de l'équipe"}
                    {v.author ? ` · ${v.author}` : ""}
                    {" · "}
                    {countChars(v.content).toLocaleString("fr-FR")} caractères
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => restore(v.id)} disabled={pending}>Reprendre</Button>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm">{v.content}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

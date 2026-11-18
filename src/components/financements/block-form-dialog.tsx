"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteBlock, saveBlock } from "@/app/(app)/financements/atelier-actions";
import { BLOCK_CATEGORIES, BLOCK_CATEGORY_LABELS, countChars, type BlockCategory } from "@/lib/financements/atelier";
import type { BlockLite } from "./atelier-dialogues";
import { Field, OptionSelect } from "./champs";

// Un texte de la bibliothèque : présentation de l'association, description d'une action,
// réponse déjà acceptée par un financeur… Réutilisable dans tous les dossiers.
export function BlockFormDialog({ initial }: { initial?: BlockLite }) {
  const edit = !!initial;
  const blankForm = { title: "", category: "presentation" as BlockCategory, content: "" };
  const fromInitial = () => (initial ? { title: initial.title, category: initial.category, content: initial.content } : blankForm);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(fromInitial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveBlock(initial?.id ?? null, f);
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
          <Button type="button" size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" />Modifier</Button>
        ) : (
          <Button type="button" size="sm"><Plus className="h-4 w-4" />Ajouter un texte</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier le texte" : "Nouveau texte de la bibliothèque"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <Field label="Titre *">
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} autoFocus placeholder="Présentation de l'association (10 lignes)" />
            </Field>
            <Field label="Rangement">
              <OptionSelect value={f.category} onChange={(v) => setF({ ...f, category: v as BlockCategory })} options={BLOCK_CATEGORIES} labels={BLOCK_CATEGORY_LABELS} ariaLabel="Rangement du texte" />
            </Field>
          </div>
          <Field label="Texte *" hint={`${countChars(f.content).toLocaleString("fr-FR")} caractères. Aucun nom d'apprenant, aucune donnée de santé ou de séjour : ces textes partent chez des financeurs.`}>
            <Textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={12} maxLength={20000} required className="text-sm leading-relaxed" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.title.trim() || !f.content.trim()}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBlockButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function remove() {
    if (!confirm(`Supprimer « ${title} » de la bibliothèque ? Les dossiers déjà rédigés ne changent pas.`)) return;
    startTransition(async () => {
      const r = await deleteBlock(id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });
  }
  return (
    <Button type="button" size="icon-sm" variant="ghost" onClick={remove} disabled={pending} aria-label={`Supprimer ${title}`} title="Supprimer">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

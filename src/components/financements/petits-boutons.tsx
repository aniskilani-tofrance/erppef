"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, FilePlus2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createApplicationFromOpportunity, deleteDeadline, deleteOpportunity, setDeadlineDone,
} from "@/app/(app)/financements/actions";

// Bouton « Copier » (numéro de dossier du portail, etc.).
export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copié.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={value.length > 60 ? label : `${label} ${value}`}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

// Case « fait » d'une échéance.
export function DeadlineDoneCheckbox({ id, done, label }: { id: string; done: boolean; label?: string }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(done);
  const router = useRouter();
  function toggle(v: boolean) {
    setChecked(v);
    startTransition(async () => {
      const r = await setDeadlineDone(id, v);
      if (!r.ok) {
        setChecked(!v);
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.refresh();
    });
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      <Checkbox checked={checked} disabled={pending} onCheckedChange={(v) => toggle(v === true)} aria-label={label ?? "Fait"} />
      fait
    </label>
  );
}

export function DeleteDeadlineButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function remove() {
    if (!confirm("Supprimer cette échéance ?")) return;
    startTransition(async () => {
      const r = await deleteDeadline(id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });
  }
  return (
    <Button type="button" size="icon-sm" variant="ghost" onClick={remove} disabled={pending} aria-label="Supprimer l'échéance" title="Supprimer">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

export function DeleteOpportunityButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function remove() {
    if (!confirm("Supprimer définitivement cette opportunité ? (Pour garder la trace, préférez « Écarter ».)")) return;
    startTransition(async () => {
      const r = await deleteOpportunity(id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.push("/financements/veille");
      }
    });
  }
  return (
    <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={pending} className="text-muted-foreground">
      <Trash2 className="h-3.5 w-3.5" />
      Supprimer
    </Button>
  );
}

// « Créer le dossier » depuis une opportunité : un clic, aucune ressaisie.
export function CreateApplicationButton({ opportunityId, size = "default" }: { opportunityId: string; size?: "default" | "sm" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function create() {
    startTransition(async () => {
      const r = await createApplicationFromOpportunity(opportunityId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (r.data) router.push(`/financements/dossiers/${r.data.id}`);
    });
  }
  return (
    <Button type="button" size={size} onClick={create} disabled={pending}>
      <FilePlus2 className="h-4 w-4" />
      {pending ? "Création…" : "Créer le dossier"}
    </Button>
  );
}

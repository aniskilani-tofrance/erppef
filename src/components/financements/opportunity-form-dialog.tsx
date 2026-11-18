"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createOpportunity, updateOpportunity } from "@/app/(app)/financements/actions";
import { FAMILIES, FAMILY_LABELS, WATCH_STATUSES, WATCH_STATUS_LABELS, type Family, type WatchStatus } from "@/lib/financements/constants";
import type { FunderLite } from "@/lib/financements/acces";
import { Field, FunderSelect, OptionSelect, OTHER } from "./champs";

export type OpportunityInitial = {
  id: string;
  title: string;
  family: Family;
  url: string | null;
  funder_id: string | null;
  funder_name: string | null;
  deadline_day: string;
  deadline_time: string;
  opens_on: string | null;
  amount_min: string;
  amount_max: string;
  max_rate: string;
  summary: string;
  eligibility_notes: string | null;
  criteria?: string | null;
  required_documents?: string | null;
  next_window_note: string | null;
  watch_status: WatchStatus;
  discard_reason: string | null;
};

// Ajout (formulaire court : moins d'une minute) ou modification (tous les champs).
export function OpportunityFormDialog({ funders, initial }: { funders: FunderLite[]; initial?: OpportunityInitial }) {
  const edit = !!initial;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blank = {
    title: "", family: "aap" as Family, url: "", funder: "", funder_name: "", deadline_day: "", deadline_time: "",
    opens_on: "", amount_min: "", amount_max: "", max_rate: "", summary: "", eligibility_notes: "", criteria: "", required_documents: "", next_window_note: "",
    watch_status: "a_evaluer" as WatchStatus, discard_reason: "",
  };
  const fromInitial = (i: OpportunityInitial) => ({
    title: i.title, family: i.family, url: i.url ?? "", funder: i.funder_id ?? (i.funder_name ? OTHER : ""),
    funder_name: i.funder_name ?? "", deadline_day: i.deadline_day, deadline_time: i.deadline_time, opens_on: i.opens_on ?? "",
    amount_min: i.amount_min, amount_max: i.amount_max, max_rate: i.max_rate, summary: i.summary,
    eligibility_notes: i.eligibility_notes ?? "", criteria: i.criteria ?? "", required_documents: i.required_documents ?? "", next_window_note: i.next_window_note ?? "",
    watch_status: i.watch_status, discard_reason: i.discard_reason ?? "",
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: f.title,
      family: f.family,
      url: f.url,
      funder_id: f.funder && f.funder !== OTHER ? f.funder : "",
      funder_name: f.funder === OTHER ? f.funder_name : "",
      deadline_day: f.deadline_day,
      deadline_time: f.deadline_time,
      opens_on: f.opens_on,
      amount_min: f.amount_min,
      amount_max: f.amount_max,
      max_rate: f.max_rate,
      summary: f.summary,
      eligibility_notes: f.eligibility_notes,
      criteria: f.criteria,
      required_documents: f.required_documents,
      next_window_note: f.next_window_note,
      ...(edit ? { watch_status: f.watch_status, discard_reason: f.discard_reason } : {}),
    };
    startTransition(async () => {
      const r = edit ? await updateOpportunity(initial!.id, payload) : await createOpportunity(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      if (!edit) setF(blank);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && initial) setF(fromInitial(initial)); }}>
      <DialogTrigger asChild>
        {edit ? (
          <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" />Modifier</Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" />Ajouter</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier l'opportunité" : "Nouvelle opportunité"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titre *">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Politique de la ville 2027 — Plaine Commune" autoFocus required maxLength={300} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Famille">
              <OptionSelect value={f.family} onChange={(v) => set("family", v as Family)} options={FAMILIES} labels={FAMILY_LABELS} ariaLabel="Famille" />
            </Field>
            <Field label="Financeur">
              <FunderSelect value={f.funder} onChange={(v) => set("funder", v)} funders={funders} allowOther allowNone />
            </Field>
          </div>
          {f.funder === OTHER && (
            <Field label="Nom du financeur" hint="Sa fiche sera créée quand le dossier sera lancé.">
              <Input value={f.funder_name} onChange={(e) => set("funder_name", e.target.value)} placeholder="Fondation …" maxLength={200} />
            </Field>
          )}
          <Field label="Lien de l'appel">
            <Input type="url" inputMode="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <Field label="Date limite">
              <Input type="date" value={f.deadline_day} onChange={(e) => set("deadline_day", e.target.value)} />
            </Field>
            <Field label="Heure">
              <Input type="time" value={f.deadline_time} onChange={(e) => set("deadline_time", e.target.value)} placeholder="23:59" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Montant min. (€)">
              <Input inputMode="decimal" value={f.amount_min} onChange={(e) => set("amount_min", e.target.value)} placeholder="3000" />
            </Field>
            <Field label="Montant max. (€)">
              <Input inputMode="decimal" value={f.amount_max} onChange={(e) => set("amount_max", e.target.value)} placeholder="10000" />
            </Field>
          </div>
          <Field label="Résumé" hint="Ce qu'on en retient, en 3 lignes.">
            <Textarea value={f.summary} onChange={(e) => set("summary", e.target.value)} rows={3} maxLength={4000} />
          </Field>

          {edit && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Statut de veille">
                  <OptionSelect value={f.watch_status} onChange={(v) => set("watch_status", v as WatchStatus)} options={WATCH_STATUSES} labels={WATCH_STATUS_LABELS} ariaLabel="Statut de veille" />
                </Field>
                <Field label="Ouverture de l'appel">
                  <Input type="date" value={f.opens_on} onChange={(e) => set("opens_on", e.target.value)} />
                </Field>
              </div>
              {f.watch_status === "ecarte" && (
                <Field label="Raison de l'écart *">
                  <Input value={f.discard_reason} onChange={(e) => set("discard_reason", e.target.value)} maxLength={500} />
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Taux maximum du financeur (%)">
                  <Input inputMode="decimal" value={f.max_rate} onChange={(e) => set("max_rate", e.target.value)} placeholder="80" />
                </Field>
                <Field label="Prochaine fenêtre" hint="Quand la date exacte n'est pas publiée.">
                  <Input value={f.next_window_note} onChange={(e) => set("next_window_note", e.target.value)} placeholder="attendu en mars 2027" maxLength={300} />
                </Field>
              </div>
              <Field label="Conditions, points de vigilance">
                <Textarea value={f.eligibility_notes} onChange={(e) => set("eligibility_notes", e.target.value)} rows={3} maxLength={4000} />
              </Field>
              <Field label="Critères de sélection" hint="Recopiez les critères de l'appel : ils guident la rédaction du dossier, et l'IA s'y réfère.">
                <Textarea value={f.criteria} onChange={(e) => set("criteria", e.target.value)} rows={4} maxLength={8000} />
              </Field>
              <Field label="Pièces à joindre">
                <Textarea value={f.required_documents} onChange={(e) => set("required_documents", e.target.value)} rows={3} maxLength={4000} />
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.title.trim()}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

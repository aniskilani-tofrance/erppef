"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createFunder, updateFunder } from "@/app/(app)/financements/actions";
import { FUNDER_KINDS, FUNDER_KIND_LABELS, PORTALS, PORTAL_LABELS, type FunderKind, type Portal } from "@/lib/financements/constants";
import type { FunderContact } from "@/lib/financements/regles";
import { Field, OptionSelect } from "./champs";

export type FunderInitial = {
  id: string;
  name: string;
  kind: FunderKind | null;
  website: string | null;
  portal: Portal | null;
  portal_account_ref: string | null;
  contacts: FunderContact[];
  usual_rules: string | null;
  notes: string | null;
};

// Fiche financeur : contacts PROFESSIONNELS seulement (nom, fonction, courriel et
// téléphone du service). Le code et la couleur du planning ne se modifient pas ici.
export function FunderFormDialog({ initial }: { initial?: FunderInitial }) {
  const edit = !!initial;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blank = {
    name: "", kind: "" as FunderKind | "", website: "", portal: "" as Portal | "", portal_account_ref: "",
    contacts: [] as FunderContact[], usual_rules: "", notes: "",
  };
  const fromInitial = (i: FunderInitial) => ({
    name: i.name, kind: (i.kind ?? "") as FunderKind | "", website: i.website ?? "", portal: (i.portal ?? "") as Portal | "",
    portal_account_ref: i.portal_account_ref ?? "", contacts: i.contacts, usual_rules: i.usual_rules ?? "", notes: i.notes ?? "",
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const setContact = (i: number, k: keyof FunderContact, v: string) =>
    setF((prev) => ({ ...prev, contacts: prev.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = edit ? await updateFunder(initial!.id, f) : await createFunder(f);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      if (!edit) {
        setF(blank);
        if ("data" in r && r.data) router.push(`/financements/financeurs/${r.data.id}`);
      } else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && initial) setF(fromInitial(initial)); }}>
      <DialogTrigger asChild>
        {edit ? (
          <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" />Modifier</Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" />Ajouter un financeur</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier le financeur" : "Nouveau financeur"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nom *">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={200} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <OptionSelect value={f.kind} onChange={(v) => set("kind", v as FunderKind | "")} options={FUNDER_KINDS} labels={FUNDER_KIND_LABELS} allowNone ariaLabel="Type de financeur" />
            </Field>
            <Field label="Portail de dépôt">
              <OptionSelect value={f.portal} onChange={(v) => set("portal", v as Portal | "")} options={PORTALS} labels={PORTAL_LABELS} allowNone ariaLabel="Portail" />
            </Field>
          </div>
          <Field label="Compte ou numéros sur le portail">
            <Input value={f.portal_account_ref} onChange={(e) => set("portal_account_ref", e.target.value)} placeholder="Tiers n° 31812" maxLength={300} />
          </Field>
          <Field label="Site">
            <Input type="url" inputMode="url" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Règles habituelles" hint="Plafond, cofinancement, pièces, calendrier.">
            <Textarea value={f.usual_rules} onChange={(e) => set("usual_rules", e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Contacts (professionnels)</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => set("contacts", [...f.contacts, {}])} disabled={f.contacts.length >= 20}>
                <UserPlus className="h-3.5 w-3.5" />Ajouter
              </Button>
            </div>
            {f.contacts.length === 0 && <p className="text-xs text-muted-foreground">Aucun contact.</p>}
            {f.contacts.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                <Input value={c.nom ?? ""} onChange={(e) => setContact(i, "nom", e.target.value)} placeholder="Nom" aria-label="Nom du contact" />
                <Input value={c.fonction ?? ""} onChange={(e) => setContact(i, "fonction", e.target.value)} placeholder="Fonction ou service" aria-label="Fonction" />
                <Input type="email" value={c.courriel ?? ""} onChange={(e) => setContact(i, "courriel", e.target.value)} placeholder="Courriel professionnel" aria-label="Courriel" />
                <div className="flex gap-2">
                  <Input type="tel" value={c.telephone ?? ""} onChange={(e) => setContact(i, "telephone", e.target.value)} placeholder="Téléphone professionnel" aria-label="Téléphone" />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer ce contact" onClick={() => set("contacts", f.contacts.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Field label="Notes">
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={8000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.name.trim()}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

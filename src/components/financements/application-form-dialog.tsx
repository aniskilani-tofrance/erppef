"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createApplication, updateApplication } from "@/app/(app)/financements/actions";
import { PORTALS, PORTAL_LABELS, STAGES, STAGE_LABELS, type Portal, type Stage } from "@/lib/financements/constants";
import type { FunderLite, TeamMember } from "@/lib/financements/acces";
import { Field, FunderSelect, NONE, OptionSelect } from "./champs";

export type ApplicationInitial = {
  id: string;
  title: string;
  funder_id: string;
  owner_id: string | null;
  next_step: string | null;
  next_step_due: string | null;
  deadline_day: string;
  deadline_time: string;
  amount_requested: string;
  amount_granted: string;
  portal: Portal | null;
  portal_ref: string | null;
  drive_url: string | null;
  notes: string | null;
};

export function ApplicationFormDialog({
  funders, team, initial, defaultOwnerId,
}: {
  funders: FunderLite[];
  team: TeamMember[];
  initial?: ApplicationInitial;
  defaultOwnerId?: string;
}) {
  const edit = !!initial;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blank = {
    title: "", funder_id: "", owner_id: defaultOwnerId ?? "", next_step: "", next_step_due: "", deadline_day: "", deadline_time: "",
    amount_requested: "", amount_granted: "", portal: "" as Portal | "", portal_ref: "", drive_url: "", notes: "", stage: "on_y_va" as Stage,
  };
  const fromInitial = (i: ApplicationInitial) => ({
    title: i.title, funder_id: i.funder_id, owner_id: i.owner_id ?? "", next_step: i.next_step ?? "", next_step_due: i.next_step_due ?? "",
    deadline_day: i.deadline_day, deadline_time: i.deadline_time, amount_requested: i.amount_requested, amount_granted: i.amount_granted,
    portal: (i.portal ?? "") as Portal | "", portal_ref: i.portal_ref ?? "", drive_url: i.drive_url ?? "", notes: i.notes ?? "", stage: "on_y_va" as Stage,
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  function pickFunder(id: string) {
    const funder = funders.find((x) => x.id === id);
    setF((prev) => ({ ...prev, funder_id: id, portal: prev.portal || funder?.portal || "" }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { stage, ...rest } = f;
    const payload = edit ? rest : { ...rest, stage };
    startTransition(async () => {
      const r = edit ? await updateApplication(initial!.id, payload) : await createApplication(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      if (!edit) {
        setF(blank);
        if ("data" in r && r.data) router.push(`/financements/dossiers/${r.data.id}`);
      } else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && initial) setF(fromInitial(initial)); }}>
      <DialogTrigger asChild>
        {edit ? (
          <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" />Modifier</Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" />Nouveau dossier</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier le dossier" : "Nouveau dossier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titre *">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Agir pour l'emploi par les mots 2027" autoFocus required maxLength={300} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Financeur *">
              <FunderSelect value={f.funder_id} onChange={pickFunder} funders={funders} />
            </Field>
            <Field label="Responsable">
              <Select value={f.owner_id || NONE} onValueChange={(v) => set("owner_id", v === NONE ? "" : v)}>
                <SelectTrigger className="w-full" aria-label="Responsable"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {team.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {!edit && (
            <Field label="Statut de départ">
              <OptionSelect value={f.stage} onChange={(v) => set("stage", v as Stage)} options={STAGES} labels={STAGE_LABELS} ariaLabel="Statut de départ" />
            </Field>
          )}
          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <Field label="Date limite de dépôt">
              <Input type="date" value={f.deadline_day} onChange={(e) => set("deadline_day", e.target.value)} />
            </Field>
            <Field label="Heure">
              <Input type="time" value={f.deadline_time} onChange={(e) => set("deadline_time", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field label="Prochaine étape">
              <Input value={f.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="Bilan intermédiaire et saisie sur Dauphin" maxLength={500} />
            </Field>
            <Field label="Pour le">
              <Input type="date" value={f.next_step_due} onChange={(e) => set("next_step_due", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Montant demandé (€)">
              <Input inputMode="decimal" value={f.amount_requested} onChange={(e) => set("amount_requested", e.target.value)} />
            </Field>
            <Field label="Montant accordé (€)">
              <Input inputMode="decimal" value={f.amount_granted} onChange={(e) => set("amount_granted", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Portail de dépôt">
              <OptionSelect value={f.portal} onChange={(v) => set("portal", v as Portal | "")} options={PORTALS} labels={PORTAL_LABELS} allowNone ariaLabel="Portail" />
            </Field>
            <Field label="N° de dossier sur le portail">
              <Input value={f.portal_ref} onChange={(e) => set("portal_ref", e.target.value)} placeholder="00123456" maxLength={100} />
            </Field>
          </div>
          <Field label="Lien du Word (Drive)">
            <Input type="url" inputMode="url" value={f.drive_url} onChange={(e) => set("drive_url", e.target.value)} placeholder="https://docs.google.com/…" />
          </Field>
          <Field label="Notes">
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={8000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.title.trim() || !f.funder_id}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

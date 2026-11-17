"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeadline, updateDeadline } from "@/app/(app)/financements/actions";
import { DEADLINE_KINDS, DEADLINE_KIND_LABELS, DEFAULT_REMINDER_DAYS, type DeadlineKind } from "@/lib/financements/constants";
import type { FunderLite } from "@/lib/financements/acces";
import { Field, FunderSelect, NONE, OptionSelect } from "./champs";

export type LinkOption = { id: string; title: string };

export type DeadlineInitial = {
  id: string;
  kind: DeadlineKind;
  title: string;
  due_day: string;
  due_time: string;
  application_id: string | null;
  opportunity_id: string | null;
  funder_id: string | null;
  reminder_days: number[];
  auto: boolean;
};

const REMINDER_CHOICES = [60, 30, 15, 7, 3, 1] as const;

// Ajouter (ou modifier) une échéance : compte rendu, versement, rendez-vous, pièce…
// Rattachée à un dossier, une opportunité ou un financeur (au moins l'un des trois).
export function DeadlineFormDialog({
  funders, applications, opportunities, initial, preset, triggerLabel = "Ajouter une échéance", triggerVariant = "default",
}: {
  funders: FunderLite[];
  applications: LinkOption[];
  opportunities: LinkOption[];
  initial?: DeadlineInitial;
  preset?: { application_id?: string; opportunity_id?: string; funder_id?: string };
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const edit = !!initial;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const blank = {
    kind: "autre" as DeadlineKind, title: "", due_day: "", due_time: "",
    application_id: preset?.application_id ?? "", opportunity_id: preset?.opportunity_id ?? "", funder_id: preset?.funder_id ?? "",
    reminder_days: [...DEFAULT_REMINDER_DAYS] as number[],
  };
  const fromInitial = (i: DeadlineInitial) => ({
    kind: i.kind, title: i.title, due_day: i.due_day, due_time: i.due_time, application_id: i.application_id ?? "",
    opportunity_id: i.opportunity_id ?? "", funder_id: i.funder_id ?? "", reminder_days: i.reminder_days,
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const locked = !!initial?.auto; // échéance de dépôt automatique : la date suit le dossier

  function toggleReminder(n: number, on: boolean) {
    setF((prev) => ({ ...prev, reminder_days: on ? [...prev.reminder_days, n] : prev.reminder_days.filter((x) => x !== n) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = edit ? await updateDeadline(initial!.id, f) : await createDeadline(f);
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
          <Button size="icon-sm" variant="ghost" aria-label="Modifier l'échéance" title="Modifier"><Pencil className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button size="sm" variant={triggerVariant}><CalendarPlus className="h-4 w-4" />{triggerLabel}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier l'échéance" : "Nouvelle échéance"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {locked && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              Échéance de dépôt automatique : sa date suit la date limite du dossier ou de l&apos;opportunité. Vous pouvez préciser le titre et les rappels.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <OptionSelect value={f.kind} onChange={(v) => set("kind", v as DeadlineKind)} options={DEADLINE_KINDS} labels={DEADLINE_KIND_LABELS} ariaLabel="Type d'échéance" />
            </Field>
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <Field label="Date *">
                <Input type="date" value={f.due_day} onChange={(e) => set("due_day", e.target.value)} required disabled={locked} />
              </Field>
              <Field label="Heure">
                <Input type="time" value={f.due_time} onChange={(e) => set("due_time", e.target.value)} disabled={locked} />
              </Field>
            </div>
          </div>
          <Field label="Titre *">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Bilan définitif 2026" required maxLength={300} />
          </Field>
          <Field label="Dossier">
            <Select value={f.application_id || NONE} onValueChange={(v) => set("application_id", v === NONE ? "" : v)} disabled={locked}>
              <SelectTrigger className="w-full" aria-label="Dossier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {applications.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opportunité">
              <Select value={f.opportunity_id || NONE} onValueChange={(v) => set("opportunity_id", v === NONE ? "" : v)} disabled={locked}>
                <SelectTrigger className="w-full" aria-label="Opportunité"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opportunities.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Financeur">
              <FunderSelect value={f.funder_id} onChange={(v) => set("funder_id", v)} funders={funders} allowNone />
            </Field>
          </div>
          <Field label="Rappels dans le mail du matin" hint="Nombre de jours avant l'échéance.">
            <div className="flex flex-wrap gap-3">
              {REMINDER_CHOICES.map((n) => (
                <label key={n} className="inline-flex items-center gap-1.5 text-sm">
                  <Checkbox checked={f.reminder_days.includes(n)} onCheckedChange={(v) => toggleReminder(n, v === true)} />
                  J-{n}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending || !f.title.trim() || !f.due_day}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

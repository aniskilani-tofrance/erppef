"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotebookPen } from "lucide-react";
import { logLeadEvent } from "@/app/(app)/leads/actions";
import { suggestNextAction } from "@/lib/leads/cadence";
import {
  EVENT_KINDS, EVENT_OUTCOMES, LEAD_STATUSES, LOST_REASONS, suggestedLeadStatus,
  type EventKind, type EventOutcome, type LeadStatus,
} from "@/lib/leads/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type LeadEventContext = {
  leadId: string;
  leadName: string;
  currentStatus: string;
  attempts: number;
  firstContactOn: string | null;
  rdvOn: string | null;
  rdvReminderSent: boolean;
  today: string;
};

const OUTREACH: EventKind[] = ["appel", "sms", "whatsapp", "email"];
const KINDS = EVENT_KINDS.filter((k) => k.code !== "statut" && k.code !== "import" && k.code !== "rdv");

// « Noter » : un appel, un SMS, une note… Le journal est la mémoire de l'équipe, et chaque
// tentative fait avancer la cadence J0 → J10 (prochaine action proposée automatiquement).
export function LeadEventDialog({
  ctx,
  defaultKind = "appel",
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  ctx: LeadEventContext;
  defaultKind?: EventKind;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [kind, setKind] = useState<EventKind>(defaultKind);
  const [outcome, setOutcome] = useState<EventOutcome>("joint");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>(suggestedLeadStatus("joint", ctx.currentStatus));
  const [statusTouched, setStatusTouched] = useState(false);
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0]);
  // Prochaine action : proposée d'après la cadence (état dérivé), remplacée dès que l'utilisateur la modifie.
  const [nextOverride, setNextOverride] = useState<{ action: string; on: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const suggestedNext = useMemo(() => {
    const isOutreach = OUTREACH.includes(kind);
    return suggestNextAction({
      status,
      attempts: ctx.attempts + (isOutreach ? 1 : 0),
      firstContactOn: ctx.firstContactOn ?? (isOutreach ? ctx.today : null),
      rdvOn: ctx.rdvOn,
      rdvReminderSent: ctx.rdvReminderSent,
      today: ctx.today,
    });
  }, [kind, status, ctx]);
  const nextAction = nextOverride?.action ?? suggestedNext?.label ?? "";
  const nextOn = nextOverride?.on ?? suggestedNext?.on ?? "";

  function handleOpenChange(o: boolean) {
    if (!o) {
      setKind(defaultKind);
      setNextOverride(null);
      setStatusTouched(false);
    }
    setOpen(o);
  }

  function changeOutcome(v: EventOutcome) {
    setOutcome(v);
    if (!statusTouched) setStatus(suggestedLeadStatus(v, ctx.currentStatus));
  }

  function submit() {
    startTransition(async () => {
      const result = await logLeadEvent({
        leadId: ctx.leadId,
        kind,
        outcome: kind === "note" ? null : outcome,
        note: note.trim() || null,
        status: kind === "note" && !statusTouched ? null : status,
        lostReason: status === "perdu" ? lostReason : null,
        nextAction: nextAction.trim() || null,
        nextActionOn: nextOn || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Noté.");
      setNote("");
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm">
              <NotebookPen className="mr-2 h-3.5 w-3.5" />
              Noter un contact
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Noter — {ctx.leadName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Quoi</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as EventKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {kind !== "note" && (
              <div className="space-y-2">
                <Label>Résultat</Label>
                <Select value={outcome} onValueChange={(v) => changeOutcome(v as EventOutcome)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_OUTCOMES.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-event-note">Note {kind === "note" ? "" : "(optionnel)"}</Label>
            <Textarea
              id="lead-event-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Rappeler jeudi à 15h (coupure) ; c'est le franchisé qui décide, portable obtenu ; prend des extras l'été…"
            />
          </div>
          <div className="space-y-2">
            <Label>Statut après ce contact</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v as LeadStatus); setStatusTouched(true); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}<span className="ml-1 text-muted-foreground">— {s.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === "perdu" && (
            <div className="space-y-2">
              <Label>Raison</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <div className="space-y-2">
              <Label htmlFor="lead-next-action">Prochaine action</Label>
              <Input id="lead-next-action" value={nextAction} onChange={(e) => setNextOverride({ action: e.target.value, on: nextOn })} placeholder="Rappeler à la coupure…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-next-on">Quand</Label>
              <Input id="lead-next-on" type="date" value={nextOn} onChange={(e) => setNextOverride({ action: nextAction, on: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotebookPen } from "lucide-react";
import { logContact } from "@/app/(app)/apprenants/admission/actions";
import {
  ADMISSION_STATUSES,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  channelLabel,
  needsReason,
  outcomeLabel,
  reasonLabel,
  reasonsFor,
  suggestedStatus,
  type AdmissionReason,
  type AdmissionStatus,
  type ContactChannel,
  type ContactOutcome,
} from "@/lib/admission/status";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appointmentKindLabel, appointmentModeLabel, dayLabel, timeOf } from "@/lib/admission/appointments";

export type ContactEntry = {
  id: string;
  contactedAt: string; // ISO
  channel: string;
  outcome: string;
  note: string | null;
  reason?: string | null;
  by: string | null;
};

// « Noter un contact » : un appel, un message, une réponse… Le journal est la trace
// de la prise de contact (et la mémoire de l'équipe : qui a parlé à qui, quand).
export function ContactDialog({
  learnerId,
  learnerName,
  currentStatus,
  history,
  triggerLabel,
  nextAppointment = null,
}: {
  learnerId: string;
  learnerName: string;
  currentStatus: string | null;
  history: ContactEntry[];
  triggerLabel?: string;
  // Prochain rendez-vous d'admission prévu (rappel en tête du journal)
  nextAppointment?: { startsAt: string; kind: string; mode: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>("whatsapp");
  const [outcome, setOutcome] = useState<ContactOutcome>("joint");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<AdmissionStatus>(suggestedStatus("joint", currentStatus));
  const [statusTouched, setStatusTouched] = useState(false);
  const [reason, setReason] = useState<AdmissionReason | "">("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Le motif dépend du statut : on le vide dès qu'on change de statut.
  function changeStatus(v: AdmissionStatus) {
    if (v !== status) setReason("");
    setStatus(v);
  }

  function changeOutcome(v: ContactOutcome) {
    setOutcome(v);
    if (!statusTouched) changeStatus(suggestedStatus(v, currentStatus));
  }

  const reasonMissing = needsReason(status) && !reason;

  function submit() {
    if (reasonMissing) {
      toast.error(status === "sans_suite" ? "Choisissez pourquoi le dossier est clos." : "Choisissez pourquoi la personne passe en liste d'attente.");
      return;
    }
    startTransition(async () => {
      const result = await logContact({ learnerId, channel, outcome, note: note.trim() || null, status, reason: reason || null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Contact noté.");
      setNote("");
      setReason("");
      setStatusTouched(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerLabel ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
            <NotebookPen className="mr-1 h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7" title={`Noter un contact — ${history.length} dans le journal`}>
            <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact — {learnerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {nextAppointment && (
            <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              Prochain RDV : <b>{dayLabel(nextAppointment.startsAt)} à {timeOf(nextAppointment.startsAt)}</b>
              {" "}· {appointmentKindLabel(nextAppointment.kind)} · {appointmentModeLabel(nextAppointment.mode).toLowerCase()}
            </p>
          )}
          {history.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">Derniers contacts</p>
              <ul className="max-h-40 overflow-y-auto px-3 py-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="py-1">
                    <span className="text-muted-foreground">
                      {new Date(h.contactedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}
                    </span>{" "}
                    · {channelLabel(h.channel)} · {outcomeLabel(h.outcome)}
                    {reasonLabel(h.reason) && <span className="font-medium"> · {reasonLabel(h.reason)}</span>}
                    {h.by && <span className="text-muted-foreground"> — {h.by}</span>}
                    {h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ContactChannel)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Résultat</Label>
              <Select value={outcome} onValueChange={(v) => changeOutcome(v as ContactOutcome)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note (optionnel)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Rappeler jeudi après 17h ; préfère les cours du matin ; a déjà un niveau A1…"
            />
          </div>
          <div className="space-y-2">
            <Label>Statut d&apos;admission après ce contact</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                changeStatus(v as AdmissionStatus);
                setStatusTouched(true);
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADMISSION_STATUSES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label}
                    <span className="ml-1 text-muted-foreground">— {s.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsReason(status) && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                {status === "liste_attente"
                  ? "Liste d'attente : la personne veut venir, mais la place ne convient pas ou n'existe pas. Elle reste dans « À reproposer » et on la recontacte dès qu'une place se libère."
                  : "Sans suite : le dossier est clos, on ne relance plus. Si la personne revient d'elle-même, notez le contact : elle reprend le parcours."}
              </p>
              <Label>{status === "liste_attente" ? "Pourquoi en liste d'attente ?" : "Pourquoi sans suite ?"}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as AdmissionReason)}>
                <SelectTrigger className="w-full" aria-invalid={reasonMissing}><SelectValue placeholder="Choisir un motif" /></SelectTrigger>
                <SelectContent>
                  {reasonsFor(status).map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || reasonMissing}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

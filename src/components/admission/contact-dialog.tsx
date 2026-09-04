"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotebookPen } from "lucide-react";
import { logContact } from "@/app/(app)/admission/actions";
import {
  ADMISSION_STATUSES,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  channelLabel,
  outcomeLabel,
  suggestedStatus,
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

export type ContactEntry = {
  id: string;
  contactedAt: string; // ISO
  channel: string;
  outcome: string;
  note: string | null;
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
}: {
  learnerId: string;
  learnerName: string;
  currentStatus: string | null;
  history: ContactEntry[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>("whatsapp");
  const [outcome, setOutcome] = useState<ContactOutcome>("joint");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<AdmissionStatus>(suggestedStatus("joint", currentStatus));
  const [statusTouched, setStatusTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changeOutcome(v: ContactOutcome) {
    setOutcome(v);
    if (!statusTouched) setStatus(suggestedStatus(v, currentStatus));
  }

  function submit() {
    startTransition(async () => {
      const result = await logContact({ learnerId, channel, outcome, note: note.trim() || null, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Contact noté.");
      setNote("");
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
                setStatus(v as AdmissionStatus);
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

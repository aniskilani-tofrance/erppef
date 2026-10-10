"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Megaphone, Sparkles } from "lucide-react";
import { draftGroupBroadcast, type BroadcastMessage } from "@/app/(app)/assistant/actions";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Kind = "annulation" | "report" | "remplacement" | "information";
const KINDS: { value: Kind; label: string }[] = [
  { value: "annulation", label: "Séance annulée" },
  { value: "report", label: "Séance déplacée" },
  { value: "remplacement", label: "Formatrice remplacée" },
  { value: "information", label: "Information pratique" },
];

// Message à tout le groupe, rédigé par l'assistant dans chaque langue du groupe, puis
// envoyé personne par personne sur WhatsApp (relecture possible, envoi tracé).
export function GroupBroadcastDialog({
  groupId,
  sessions,
  rooms,
  trainers,
  disabled,
}: {
  groupId: string;
  sessions: { id: string; label: string }[];
  rooms: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("annulation");
  const [sessionId, setSessionId] = useState("none");
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [roomId, setRoomId] = useState("none");
  const [trainerId, setTrainerId] = useState("none");
  const [details, setDetails] = useState("");
  const [messages, setMessages] = useState<BroadcastMessage[] | null>(null);
  const [fr, setFr] = useState("");
  const [pending, startTransition] = useTransition();

  function prepare() {
    startTransition(async () => {
      const r = await draftGroupBroadcast({
        groupId, kind,
        sessionId: sessionId === "none" ? null : sessionId,
        newDate: newDate || null, newStart: newStart || null, newEnd: newEnd || null,
        roomId: roomId === "none" ? null : roomId,
        replacementTrainerId: trainerId === "none" ? null : trainerId,
        details: details.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setMessages(r.messages);
      setFr(r.fr);
    });
  }
  const traceNote = `Message au groupe (${KINDS.find((k) => k.value === kind)?.label.toLowerCase()})`;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMessages(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} title="Prévenir tout le groupe : annulation, report, remplacement (rédigé par l'assistant dans chaque langue)">
          <Megaphone className="mr-1.5 h-3.5 w-3.5" />
          Prévenir le groupe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prévenir le groupe</DialogTitle>
        </DialogHeader>
        {!messages ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Quoi</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Séance concernée</Label>
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune en particulier</SelectItem>
                    {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {kind === "report" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2"><Label>Nouvelle date</Label><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>Début</Label><Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} /></div>
                <div className="space-y-2"><Label>Fin</Label><Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(kind === "report" || kind === "information") && (
                <div className="space-y-2">
                  <Label>Salle (si elle change)</Label>
                  <Select value={roomId} onValueChange={setRoomId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Inchangée</SelectItem>
                      {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {kind === "remplacement" && (
                <div className="space-y-2">
                  <Label>Qui remplace</Label>
                  <Select value={trainerId} onValueChange={setTrainerId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non précisé</SelectItem>
                      {trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Précisions (optionnel)</Label>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Apportez votre livret ; la séance est rattrapée le 20 ; merci de répondre reçu…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button onClick={prepare} disabled={pending}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {pending ? "Rédaction…" : "Préparer les messages"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Message en français (chaque personne reçoit aussi sa langue si elle est connue)</p>
              <pre className="whitespace-pre-wrap font-sans text-sm">{fr}</pre>
            </div>
            <ul className="divide-y rounded-md border">
              {messages.map((m) => (
                <li key={m.learnerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span>
                    {m.firstName}
                    <span className="ml-2 text-xs text-muted-foreground">{m.language ?? "français"}{m.phone ? "" : " · sans téléphone"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copier ce message" onClick={() => { navigator.clipboard.writeText(m.text); toast.success(`Message pour ${m.firstName} copié.`); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <WhatsAppButton phone={m.phone} message={m.text} trace={{ kind: "contact", learnerId: m.learnerId, note: traceNote }} label="WhatsApp" />
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMessages(null)} disabled={pending}>Modifier</Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

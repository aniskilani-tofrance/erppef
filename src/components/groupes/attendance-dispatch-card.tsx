"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, Save, Send } from "lucide-react";
import { sendAttendanceDispatchNow, updateAttendanceDispatch } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type DispatchHistoryRow = {
  id: string;
  sentAt: string;
  mode: string;
  status: string;
  recipients: string[];
  cc: string[];
  sheets: number;
  missing: number;
  periodFrom: string;
  periodTo: string;
  error: string | null;
};

const STATUS_LABEL: Record<string, string> = { envoye: "Envoyé", reporte: "Reporté (rien de clôturé)", rien: "Rien à envoyer", erreur: "Erreur" };
const MODE_LABEL: Record<string, string> = { auto: "vendredi", manuel: "manuel", test: "test" };

function fmt(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }): string {
  return new Date(iso).toLocaleString("fr-FR", { ...opts, timeZone: "Europe/Paris" });
}

// « Feuilles d'émargement au financeur » : réglage de l'envoi hebdomadaire (vendredi
// après-midi), envoi manuel, test à soi-même, historique.
export function AttendanceDispatchCard({
  groupId,
  enabled: initialEnabled,
  to: initialTo,
  cc: initialCc,
  lastSentAt,
  history,
  canWrite,
}: {
  groupId: string;
  enabled: boolean;
  to: string[];
  cc: string[];
  lastSentAt: string | null;
  history: DispatchHistoryRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [to, setTo] = useState(initialTo.join("\n"));
  const [cc, setCc] = useState(initialCc.join("\n"));
  const [saving, startSave] = useTransition();
  const [sending, setSending] = useState<"manuel" | "test" | null>(null);
  const dirty = enabled !== initialEnabled || to !== initialTo.join("\n") || cc !== initialCc.join("\n");

  function save() {
    startSave(async () => {
      const result = await updateAttendanceDispatch({ groupId, enabled, to, cc });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(enabled ? "Envoi hebdomadaire actif : chaque vendredi après-midi." : "Réglages enregistrés (envoi hebdomadaire inactif).");
        router.refresh();
      }
    });
  }

  async function send(mode: "manuel" | "test") {
    if (dirty) {
      toast.error("Enregistrez d'abord les destinataires.");
      return;
    }
    setSending(mode);
    const result = await sendAttendanceDispatchNow(groupId, mode);
    setSending(null);
    if (!result.ok) toast.error(result.error);
    else {
      (result.status === "envoye" ? toast.success : toast.info)(result.message);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <>
          <div className="flex items-center gap-3">
            <Switch id="attendance-mail-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="attendance-mail-enabled" className="cursor-pointer">
              Envoyer automatiquement chaque vendredi après-midi les feuilles clôturées de la semaine
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="attendance-mail-to">Destinataires</Label>
              <Textarea id="attendance-mail-to" value={to} onChange={(e) => setTo(e.target.value)} rows={3} placeholder={"une adresse par ligne\nex. mba@mairie-saint-ouen.fr"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-mail-cc">En copie</Label>
              <Textarea id="attendance-mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} rows={3} placeholder="une adresse par ligne" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => send("manuel")} disabled={sending !== null || dirty} title="Envoie tout de suite aux destinataires les feuilles clôturées depuis le dernier envoi">
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {sending === "manuel" ? "Envoi…" : "Envoyer maintenant"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => send("test")} disabled={sending !== null || dirty} title="Le même email, envoyé à vous seul, sans toucher au dernier envoi">
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
              {sending === "test" ? "Envoi…" : "M'envoyer un test"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {lastSentAt ? `Dernier envoi : ${fmt(lastSentAt)}` : "Jamais envoyé (le premier envoi couvre les 7 derniers jours)"}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {initialEnabled ? `Envoi automatique chaque vendredi à ${initialTo.join(", ")}.` : "Envoi hebdomadaire inactif."}
        </p>
      )}

      {history.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5">
              <span className="font-medium">{fmt(h.sentAt)}</span>
              <span className={h.status === "envoye" ? "text-emerald-700" : h.status === "erreur" ? "text-destructive" : "text-muted-foreground"}>
                {STATUS_LABEL[h.status] ?? h.status}
              </span>
              <span className="text-muted-foreground">
                {h.sheets} feuille{h.sheets > 1 ? "s" : ""}{h.missing ? ` · ${h.missing} en attente` : ""} · {MODE_LABEL[h.mode] ?? h.mode}
              </span>
              <span className="w-full truncate text-xs text-muted-foreground sm:w-auto sm:flex-1">
                {fmt(h.periodFrom, { day: "2-digit", month: "2-digit" })} → {fmt(h.periodTo, { day: "2-digit", month: "2-digit" })} · {h.recipients.join(", ")}{h.error ? ` · ${h.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

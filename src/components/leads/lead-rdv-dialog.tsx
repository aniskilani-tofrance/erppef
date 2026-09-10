"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { setLeadRdv, setRdvOutcome } from "@/app/(app)/leads/actions";
import { RDV_MODES, type RdvMode } from "@/lib/leads/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Poser le RDV avec la direction : deux créneaux hors service, jamais « quand êtes-vous dispo ? ».
export function LeadRdvDialog({ leadId, slot1, slot2, hasRdv }: { leadId: string; slot1: string; slot2: string; hasRdv: boolean }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("15:00");
  const [mode, setMode] = useState<RdvMode>("sur_site");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const r = await setLeadRdv({ leadId, date, time, mode });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("RDV posé. Pensez à l'email de confirmation (n°1) et au SMS la veille.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={hasRdv ? "outline" : "default"}>
          <CalendarPlus className="mr-2 h-4 w-4" />{hasRdv ? "Déplacer le RDV" : "Poser le RDV"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rendez-vous avec la direction</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Créneaux types à proposer : <b>{slot1}</b> ou <b>{slot2}</b> — toujours hors service. Dans le restaurant, entre les deux services, le show rate est meilleur.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rdv-date">Date</Label>
              <Input id="rdv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rdv-time">Heure</Label>
              <Input id="rdv-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Comment</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as RdvMode)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RDV_MODES.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !date || !time}>{pending ? "Enregistrement…" : "Enregistrer le RDV"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RdvOutcomeButtons({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function set(outcome: "tenu" | "no_show" | "reporte") {
    startTransition(async () => {
      const r = await setRdvOutcome({ leadId, outcome });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(outcome === "tenu" ? "RDV tenu — à la direction de jouer." : outcome === "no_show" ? "No-show noté : email n°6 + SMS à envoyer." : "RDV reporté : reposer deux créneaux.");
        router.refresh();
      }
    });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="text-emerald-700" disabled={pending} onClick={() => set("tenu")}>RDV tenu</Button>
      <Button size="sm" variant="outline" className="text-amber-700" disabled={pending} onClick={() => set("no_show")}>No-show</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("reporte")}>Reporté</Button>
    </div>
  );
}

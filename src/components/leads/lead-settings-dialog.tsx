"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { saveLeadSettings } from "@/app/(app)/leads/actions";
import type { LeadSettings } from "@/lib/leads/templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Réglages de la direction : la date du prochain groupe (l'argument d'urgence des scripts),
// le Calendly, les deux créneaux types. Injectés dans tous les modèles SMS / email.
export function LeadSettingsDialog({ settings }: { settings: LeadSettings }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LeadSettings>(settings);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k: keyof LeadSettings, v: string) => setF((s) => ({ ...s, [k]: v }));

  function submit() {
    startTransition(async () => {
      const r = await saveLeadSettings(f);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Réglages enregistrés : les modèles de messages sont à jour.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(settings); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Prochain groupe, Calendly, créneaux types"><Settings2 className="mr-2 h-4 w-4" />Réglages</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Réglages des leads</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ls-group">Prochain groupe restauration (tel que dit au téléphone)</Label>
            <Input id="ls-group" value={f.nextGroupLabel} onChange={(e) => set("nextGroupLabel", e.target.value)} placeholder="le 2 novembre" />
            <p className="text-xs text-muted-foreground">Apparaît dans « notre prochain groupe restauration démarre … ».</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ls-calendly">Lien Calendly de la direction</Label>
            <Input id="ls-calendly" value={f.calendlyUrl} onChange={(e) => set("calendlyUrl", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ls-slot1">Créneau type n°1</Label>
              <Input id="ls-slot1" value={f.slot1} onChange={(e) => set("slot1", e.target.value)} placeholder="mardi 10h" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-slot2">Créneau type n°2</Label>
              <Input id="ls-slot2" value={f.slot2} onChange={(e) => set("slot2", e.target.value)} placeholder="jeudi 15h" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ls-director">Qui tient le RDV</Label>
            <Input id="ls-director" value={f.directorName} onChange={(e) => set("directorName", e.target.value)} />
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

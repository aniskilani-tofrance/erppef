"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Settings2 } from "lucide-react";
import { saveLeadSettings } from "@/app/(app)/leads/actions";
import type { LeadSettings } from "@/lib/leads/templates";
import type { Owner } from "@/lib/leads/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Réglages de la direction : la date du prochain groupe (l'argument d'urgence des scripts),
// le Calendly, les créneaux types — et le branchement automatique des leads (webhook).
export function LeadSettingsDialog({ settings, owners }: { settings: LeadSettings; owners: Owner[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LeadSettings>(settings);
  const [tokenAction, setTokenAction] = useState<"keep" | "regenerate" | "disable">("keep");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k: keyof LeadSettings, v: string) => setF((s) => ({ ...s, [k]: v }));
  const origin = typeof window !== "undefined" ? window.location.origin : "https://pef-erp.vercel.app";
  const webhookUrl = settings.inboundToken ? `${origin}/api/leads/inbound?token=${settings.inboundToken}` : null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  }

  function submit() {
    startTransition(async () => {
      const r = await saveLeadSettings({
        nextGroupLabel: f.nextGroupLabel,
        calendlyUrl: f.calendlyUrl,
        slot1: f.slot1,
        slot2: f.slot2,
        directorName: f.directorName,
        notifyEmail: f.notifyEmail,
        defaultOwnerUserId: f.defaultOwnerUserId,
        inboundTokenAction: tokenAction,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Réglages enregistrés.");
      setTokenAction("keep");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF(settings); setTokenAction("keep"); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Prochain groupe, Calendly, créneaux, webhook"><Settings2 className="mr-2 h-4 w-4" />Réglages</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Réglages des leads</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ce que disent les messages</h3>
            <div className="space-y-1.5">
              <Label htmlFor="ls-group">Prochain groupe restauration (tel que dit au téléphone)</Label>
              <Input id="ls-group" value={f.nextGroupLabel} onChange={(e) => set("nextGroupLabel", e.target.value)} placeholder="le 2 novembre" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-calendly">Lien Calendly (proposé dans les SMS et emails)</Label>
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
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leads qui arrivent tout seuls (webhook)</h3>
            <div className="space-y-1.5">
              <Label>Attribuer les nouveaux leads à</Label>
              <Select value={f.defaultOwnerUserId || "none"} onValueChange={(v) => set("defaultOwnerUserId", v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Personne (à attribuer à la main)</SelectItem>
                  {owners.map((o) => <SelectItem key={o.userId} value={o.userId}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-notify">Email prévenu à chaque nouveau lead</Label>
              <Input id="ls-notify" value={f.notifyEmail} onChange={(e) => set("notifyEmail", e.target.value)} placeholder="mohammad.shahzad9@gmail.com" inputMode="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse du webhook (à coller dans Brevo, Make ou Calendly)</Label>
              {webhookUrl ? (
                <div className="flex items-center gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(webhookUrl)} title="Copier"><Copy className="h-4 w-4" /></Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pas encore ouvert : enregistrez une première fois pour créer le jeton.</p>
              )}
              <p className="text-xs text-muted-foreground">
                POST en JSON ou formulaire. Champs reconnus : entreprise/restaurant, prénom, nom, téléphone, email, ville, postes, nb_postes, message, utm_source, utm_campaign. Doublon (même téléphone ou email sous 30 jours) = pas de nouvelle fiche. Calendly (invitee.created) est reconnu et pose le RDV.
              </p>
              {webhookUrl && (
                <Select value={tokenAction} onValueChange={(v) => setTokenAction(v as typeof tokenAction)}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Garder le jeton actuel</SelectItem>
                    <SelectItem value="regenerate">Régénérer le jeton (l&apos;ancienne adresse cesse de fonctionner)</SelectItem>
                    <SelectItem value="disable">Fermer le webhook</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

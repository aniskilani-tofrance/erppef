"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { assignLead, deleteLead, setLeadStatus, setNextAction } from "@/app/(app)/leads/actions";
import { LEAD_STATUSES, LOST_REASONS, leadStatusBadgeClass } from "@/lib/leads/status";
import type { Owner } from "@/lib/leads/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<string>(LOST_REASONS[0]);
  const router = useRouter();

  function apply(next: string, reason?: string) {
    startTransition(async () => {
      const r = await setLeadStatus({ leadId, status: next, lostReason: reason ?? null });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Statut mis à jour.");
        router.refresh();
      }
    });
  }

  return (
    <>
      <Select
        value={status}
        onValueChange={(v) => {
          if (v === "perdu") setLostOpen(true);
          else apply(v);
        }}
        disabled={pending}
      >
        <SelectTrigger className={cn("h-8 w-[220px] text-xs", leadStatusBadgeClass(status))} title="Changer le statut">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {s.label}<span className="ml-1 text-muted-foreground">— {s.hint}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Classer « Perdu »</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Raison (pour le point hebdo)</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLostOpen(false)}>Annuler</Button>
              <Button onClick={() => { setLostOpen(false); apply("perdu", lostReason); }}>Confirmer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OwnerSelect({ leadId, ownerUserId, owners }: { leadId: string; ownerUserId: string | null; owners: Owner[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Select
      value={ownerUserId ?? "none"}
      disabled={pending}
      onValueChange={(v) =>
        startTransition(async () => {
          const r = await assignLead({ leadId, ownerUserId: v === "none" ? null : v });
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        })
      }
    >
      <SelectTrigger className="h-8 w-[180px] text-xs" title="Qui suit ce lead"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Personne</SelectItem>
        {owners.map((o) => <SelectItem key={o.userId} value={o.userId}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function NextActionEditor({ leadId, action, on }: { leadId: string; action: string | null; on: string | null }) {
  const [a, setA] = useState(action ?? "");
  const [d, setD] = useState(on ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[200px] flex-1 space-y-1">
        <Label htmlFor="next-action-text" className="text-xs">Prochaine action</Label>
        <Input id="next-action-text" value={a} onChange={(e) => setA(e.target.value)} className="h-8 text-sm" placeholder="Rappeler à la coupure" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="next-action-on" className="text-xs">Quand</Label>
        <Input id="next-action-on" type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-8 text-sm" />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setNextAction({ leadId, nextAction: a || null, nextActionOn: d || null });
            if (!r.ok) toast.error(r.error);
            else {
              toast.success("Prochaine action enregistrée.");
              router.refresh();
            }
          })
        }
      >
        Enregistrer
      </Button>
    </div>
  );
}

export function DeleteLeadButton({ leadId, company }: { leadId: string; company: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Supprimer définitivement le lead « ${company} » et son journal ?`)) return;
        startTransition(async () => {
          const r = await deleteLead({ leadId });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Lead supprimé.");
            router.push("/leads");
            router.refresh();
          }
        });
      }}
    >
      <Trash2 className="mr-2 h-3.5 w-3.5" />Supprimer
    </Button>
  );
}

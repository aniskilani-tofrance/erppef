"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Euro, FileText, Undo2 } from "lucide-react";
import { cancelMembershipPayment, recordMembershipPayment } from "@/app/(app)/apprenants/documents-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COTISATION_EUROS,
  PAYMENT_METHODS,
  membershipLabel,
  membershipYearLabel,
  parisDay,
  type MembershipRow,
  type PaymentMethod,
} from "@/lib/documents-apprenant/regles";

// Cotisation annuelle : « Saisir le paiement » (montant 40 € par défaut, date, mode), reçu
// PDF une fois payée, « Annuler » en cas d'erreur de saisie. Admin et coordination.
export function MembershipPayment({
  learnerId,
  learnerName,
  year,
  membership,
  onChanged,
  size = "sm",
}: {
  learnerId: string;
  learnerName: string;
  year: number;
  membership: MembershipRow | null;
  onChanged?: () => void;
  size?: "sm" | "xs";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(COTISATION_EUROS));
  const [paidOn, setPaidOn] = useState(parisDay());
  const [method, setMethod] = useState<PaymentMethod>("especes");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const cls = size === "xs" ? "h-7 px-2 text-xs" : "";

  const after = () => {
    onChanged?.();
    router.refresh();
  };

  const save = () =>
    start(async () => {
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        toast.error("Montant invalide.");
        return;
      }
      const res = await recordMembershipPayment({ learnerId, year, amountEuros: value, paidOn, method, note: note.trim() || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Cotisation ${membershipYearLabel(year)} enregistrée pour ${learnerName}.`);
      setOpen(false);
      after();
    });

  const cancel = () =>
    start(async () => {
      if (!window.confirm(`Remettre la cotisation ${membershipYearLabel(year)} de ${learnerName} en « non payée » ?`)) return;
      const res = await cancelMembershipPayment({ learnerId, year });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Cotisation remise en « non payée ».");
        after();
      }
    });

  if (membership?.paid) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-xs text-emerald-700">Cotisation {membershipLabel(membership)}</span>
        <Button asChild variant="ghost" size="sm" className={cls}>
          <a href={`/apprenants/${learnerId}/recu-adhesion?annee=${year}`} target="_blank" rel="noreferrer">
            <FileText className="mr-1 h-3.5 w-3.5" />
            Reçu
          </a>
        </Button>
        <Button variant="ghost" size="sm" className={cls} onClick={cancel} disabled={pending} title="Erreur de saisie : remettre en « non payée »">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className={cls} onClick={() => setOpen(true)}>
        <Euro className="mr-1 h-3.5 w-3.5" />
        Cotisation payée
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Cotisation {membershipYearLabel(year)} — {learnerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Montant (€)</Label>
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Payée le</Label>
                <Input type="date" value={paidOn} max={parisDay()} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note (facultatif)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="n° de chèque, tarif réduit décidé par le bureau…" />
            </div>
            <p className="text-xs text-muted-foreground">
              À encaisser après le délai pour changer d&apos;avis du contrat (10 jours, 14 jours si signé par le lien). Un reçu PDF est prêt dès l&apos;enregistrement.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer le paiement"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

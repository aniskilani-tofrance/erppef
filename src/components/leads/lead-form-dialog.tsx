"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { upsertLead, type LeadInput } from "@/app/(app)/leads/actions";
import type { LeadRow, Owner } from "@/lib/leads/queries";
import {
  CONTRACT_TYPES, HACCP_STATUSES, HIRING_HORIZONS, LEAD_OFFERS, LEAD_SCORES, LEAD_SEGMENTS, LEAD_SOURCES, contractEligible,
} from "@/lib/leads/status";
import { suggestScore } from "@/lib/leads/scoring";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Form = {
  company: string; segment: string; source: string; campaign: string; contactName: string; contactRole: string; phone: string;
  email: string; city: string; postalCode: string; positions: string; positionsCount: string; contractType: string; hoursPerWeek: string;
  hiringHorizon: string; hiringDeadline: string; decisionMaker: "oui" | "non" | "inconnu"; haccpStatus: string; covers: string;
  teamSize: string; pain: string; score: string; offer: string; ownerUserId: string; notes: string;
};

function fromLead(l?: LeadRow | null): Form {
  return {
    company: l?.company ?? "", segment: l?.segment ?? "inconnu", source: l?.source ?? "formulaire_meta", campaign: l?.campaign ?? "",
    contactName: l?.contact_name ?? "", contactRole: l?.contact_role ?? "", phone: l?.phone ?? "", email: l?.email ?? "",
    city: l?.city ?? "", postalCode: l?.postal_code ?? "", positions: l?.positions ?? "", positionsCount: String(l?.positions_count ?? 1),
    contractType: l?.contract_type ?? "inconnu", hoursPerWeek: l?.hours_per_week ? String(l.hours_per_week) : "",
    hiringHorizon: l?.hiring_horizon ?? "inconnu", hiringDeadline: l?.hiring_deadline ?? "",
    decisionMaker: l?.decision_maker == null ? "inconnu" : l.decision_maker ? "oui" : "non", haccpStatus: l?.haccp_status ?? "inconnu",
    covers: l?.covers ?? "", teamSize: l?.team_size ? String(l.team_size) : "", pain: l?.pain ?? "", score: l?.score ?? "auto",
    offer: l?.offer ?? "none", ownerUserId: l?.owner_user_id ?? "none", notes: l?.notes ?? "",
  };
}

const CONTACT_ROLES = ["Gérant", "Franchisé", "Directeur de restaurant", "Manager", "Chef de cuisine", "Chef gérant", "Responsable RH", "Autre"];

// Fiche lead : création (« Nouveau lead ») ou modification (crayon). Les 7 questions de
// qualification du script sont là, dans l'ordre de l'appel.
export function LeadFormDialog({ lead, owners, trigger }: { lead?: LeadRow | null; owners: Owner[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(() => fromLead(lead));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const suggested = suggestScore({
    positionsCount: Number(f.positionsCount) || 0,
    hiringHorizon: f.hiringHorizon,
    contractType: f.contractType,
    decisionMaker: f.decisionMaker === "inconnu" ? null : f.decisionMaker === "oui",
  });
  const eligible = contractEligible(f.contractType);

  function submit() {
    const input: LeadInput = {
      id: lead?.id,
      company: f.company,
      segment: f.segment as LeadInput["segment"],
      source: f.source as LeadInput["source"],
      campaign: f.campaign || null,
      contactName: f.contactName || null,
      contactRole: f.contactRole || null,
      phone: f.phone || null,
      email: f.email || null,
      city: f.city || null,
      postalCode: f.postalCode || null,
      positions: f.positions || null,
      positionsCount: Number(f.positionsCount) || 0,
      contractType: f.contractType as LeadInput["contractType"],
      hoursPerWeek: f.hoursPerWeek ? Number(f.hoursPerWeek) : null,
      hiringHorizon: f.hiringHorizon as LeadInput["hiringHorizon"],
      hiringDeadline: f.hiringDeadline || null,
      decisionMaker: f.decisionMaker === "inconnu" ? null : f.decisionMaker === "oui",
      haccpStatus: f.haccpStatus as LeadInput["haccpStatus"],
      covers: f.covers || null,
      teamSize: f.teamSize ? Number(f.teamSize) : null,
      pain: f.pain || null,
      score: (f.score === "auto" ? suggested : f.score) as LeadInput["score"],
      offer: f.offer === "none" ? null : (f.offer as LeadInput["offer"]),
      ownerUserId: f.ownerUserId === "none" ? null : f.ownerUserId,
      notes: f.notes || null,
    };
    startTransition(async () => {
      const result = await upsertLead(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(lead ? "Fiche enregistrée." : "Lead créé.");
      setOpen(false);
      if (lead) router.refresh();
      else {
        setF(fromLead(null));
        router.push(`/leads/${result.id}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromLead(lead)); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          lead ? (
            <Button variant="outline" size="sm"><Pencil className="mr-2 h-3.5 w-3.5" />Modifier la fiche</Button>
          ) : (
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nouveau lead</Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? `Fiche — ${lead.company}` : "Nouveau lead restaurateur"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">L&apos;établissement</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-company">Restaurant / enseigne *</Label>
                <Input id="lead-company" value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Chez Karim, McDonald's Saint-Ouen, Sodexo — Cuisine centrale…" />
              </div>
              <div className="space-y-1.5">
                <Label>Type d&apos;établissement</Label>
                <Select value={f.segment} onValueChange={(v) => set("segment", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_SEGMENTS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>D&apos;où vient le lead</Label>
                <Select value={f.source} onValueChange={(v) => set("source", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-city">Ville</Label>
                <Input id="lead-city" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Saint-Denis" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-cp">Code postal</Label>
                <Input id="lead-cp" value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="93200" inputMode="numeric" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-campaign">Campagne / visuel (UTM)</Label>
                <Input id="lead-campaign" value={f.campaign} onChange={(e) => set("campaign", e.target.value)} placeholder="V2 galère du recrutement" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Le contact</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lead-contact">Prénom NOM</Label>
                <Input id="lead-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Karim BENALI" />
              </div>
              <div className="space-y-1.5">
                <Label>Fonction</Label>
                <Select value={f.contactRole || "none"} onValueChange={(v) => set("contactRole", v === "none" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Téléphone (portable de préférence)</Label>
                <Input id="lead-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input id="lead-email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="contact@restaurant.fr" inputMode="email" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">La qualification (les 7 questions)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lead-covers">1. Taille : couverts par service</Label>
                <Input id="lead-covers" value={f.covers} onChange={(e) => set("covers", e.target.value)} placeholder="80 le midi, 40 le soir" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-team">Équipe (personnes)</Label>
                <Input id="lead-team" value={f.teamSize} onChange={(e) => set("teamSize", e.target.value)} inputMode="numeric" placeholder="8" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-positions">2. Postes qu&apos;il manque (cuisine / salle)</Label>
                <Input id="lead-positions" value={f.positions} onChange={(e) => set("positions", e.target.value)} placeholder="commis de cuisine, plongeur" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-count">Combien de personnes</Label>
                <Input id="lead-count" value={f.positionsCount} onChange={(e) => set("positionsCount", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>3. Pour quand</Label>
                <Select value={f.hiringHorizon} onValueChange={(v) => set("hiringHorizon", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{HIRING_HORIZONS.map((h) => <SelectItem key={h.code} value={h.code}>{h.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-deadline">Précision (ouverture, saison, départ…)</Label>
                <Input id="lead-deadline" value={f.hiringDeadline} onChange={(e) => set("hiringDeadline", e.target.value)} placeholder="novembre — départ du second" />
              </div>
              <div className="space-y-1.5">
                <Label>4. Contrat envisagé</Label>
                <Select value={f.contractType} onValueChange={(v) => set("contractType", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_TYPES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {eligible === false && <p className="text-xs text-amber-700">Pas de POEI possible avec ce contrat → dérouler la cascade (FLE, AKTO, HACCP).</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-hours">Heures par semaine</Label>
                <Input id="lead-hours" value={f.hoursPerWeek} onChange={(e) => set("hoursPerWeek", e.target.value)} inputMode="numeric" placeholder="39" />
                {f.hoursPerWeek && Number(f.hoursPerWeek) < 24 && <p className="text-xs text-amber-700">Temps partiel : la direction valide l&apos;éligibilité, ne rien promettre.</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-pain">5. Ce qui coince aujourd&apos;hui (sa douleur, avec ses mots)</Label>
                <Textarea id="lead-pain" rows={2} value={f.pain} onChange={(e) => set("pain", e.target.value)} placeholder="« Ils partent au bout de deux semaines », no-show aux entretiens, personne ne veut la plonge…" />
              </div>
              <div className="space-y-1.5">
                <Label>6. C&apos;est le décideur ?</Label>
                <Select value={f.decisionMaker} onValueChange={(v) => set("decisionMaker", v as Form["decisionMaker"])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oui">Oui — gérant / franchisé</SelectItem>
                    <SelectItem value="non">Non — manager, siège, franchise</SelectItem>
                    <SelectItem value="inconnu">Pas encore demandé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bonus : HACCP dans l&apos;établissement</Label>
                <Select value={f.haccpStatus} onValueChange={(v) => set("haccpStatus", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{HACCP_STATUSES.map((h) => <SelectItem key={h.code} value={h.code}>{h.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Le pipeline</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Score</Label>
                <Select value={f.score} onValueChange={(v) => set("score", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatique ({LEAD_SCORES.find((s) => s.code === suggested)?.label})</SelectItem>
                    {LEAD_SCORES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Offre qui accroche</Label>
                <Select value={f.offer} onValueChange={(v) => set("offer", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pas encore</SelectItem>
                    {LEAD_OFFERS.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Suivi par</Label>
                <Select value={f.ownerUserId} onValueChange={(v) => set("ownerUserId", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{lead ? "Personne" : "Moi"}</SelectItem>
                    {owners.map((o) => <SelectItem key={o.userId} value={o.userId}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea id="lead-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ouvert 7/7, patron joignable 10h-11h30, utilise déjà la POEI avec un autre organisme…" />
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button onClick={submit} disabled={pending || !f.company.trim()}>{pending ? "Enregistrement…" : lead ? "Enregistrer" : "Créer le lead"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefcaseBusiness, Pencil, Plus, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import {
  convertLeadToCandidate, deleteCandidate, logCandidateEvent, proposeLearnerForPoei, recordConsent, setCandidateStatus, setPlacement,
  upsertCandidate, type CandidateInput,
} from "@/app/(app)/candidats-poei/actions";
import type { CandidateRow } from "@/lib/poei-candidates/queries";
import {
  CANDIDATE_EVENT_KINDS, CANDIDATE_EVENT_OUTCOMES, CANDIDATE_LOST_REASONS, CANDIDATE_SOURCES, CANDIDATE_STATUSES, CONSENT_CHANNELS,
  FT_STATUSES, QUALIFICATION_QUESTIONS, WORK_PERMITS, candidateStatusBadgeClass,
} from "@/lib/poei-candidates/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function useAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Action impossible");
      else {
        toast.success(success);
        after?.();
        router.refresh();
      }
    });
  }
  return { pending, run, router };
}

// ── Entrées : admission (apprenant) et lead resto ────────────────────────────
export function ProposePoeiButton({ learnerId, candidateId }: { learnerId: string; candidateId: string | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (candidateId) {
    return (
      <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs" title="Déjà candidat POEI — ouvrir la fiche">
        <a href={`/candidats-poei/${candidateId}`}><UserRoundCheck className="mr-1 h-3.5 w-3.5" />POEI</a>
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 px-2 text-xs"
      disabled={pending}
      title="Proposer en POEI restauration : crée la fiche candidat (consentement à recueillir avant toute transmission)"
      onClick={() =>
        startTransition(async () => {
          const r = await proposeLearnerForPoei({ learnerId });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Fiche candidat POEI créée.");
            router.push(`/candidats-poei/${r.id}`);
          }
        })
      }
    >
      <BriefcaseBusiness className="mr-1 h-3.5 w-3.5" />POEI
    </Button>
  );
}

export function ConvertLeadButton({ leadId, candidateId }: { leadId: string; candidateId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (candidateId) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={`/candidats-poei/${candidateId}`}><UserRoundCheck className="mr-2 h-4 w-4" />Fiche candidat POEI</a>
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="La personne cherche un emploi : ce n'est pas un employeur">
          <UserRoundCheck className="mr-2 h-4 w-4" />C&apos;est un candidat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Requalifier en candidat POEI</DialogTitle>
          <DialogDescription>
            La personne cherche un emploi en restauration au lieu d&apos;en proposer un. Une fiche candidat est créée avec ses coordonnées et ce lead passe « Hors cible » (sans e-mail automatique).
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await convertLeadToCandidate({ leadId });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Candidat POEI créé, lead classé hors cible.");
                  setOpen(false);
                  router.push(`/candidats-poei/${r.id}`);
                }
              })
            }
          >
            Créer la fiche candidat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Fiche : identité + qualification ─────────────────────────────────────────
type Form = Required<{ [K in keyof CandidateInput]: string }>;

function fromCandidate(c?: CandidateRow | null): Form {
  return {
    id: c?.id ?? "", source: c?.source ?? "direct", firstName: c?.first_name ?? "", lastName: c?.last_name ?? "", phone: c?.phone ?? "",
    email: c?.email ?? "", city: c?.city ?? "", ftStatus: c?.ft_status ?? "inconnu", ftId: c?.ft_id ?? "", income: c?.income ?? "",
    frenchLevel: c?.french_level ?? "", goal: c?.goal ?? "", targetJob: c?.target_job ?? "", experience: c?.experience ?? "",
    availability: c?.availability ?? "", mobility: c?.mobility ?? "", workPermit: c?.work_permit ?? "inconnu",
    constraints: c?.constraints ?? "", notes: c?.notes ?? "",
  };
}

function question(field: string): string {
  return QUALIFICATION_QUESTIONS.find((q) => q.field === field)?.question ?? "";
}

export function CandidateFormDialog({ candidate, trigger }: { candidate?: CandidateRow | null; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Form>(() => fromCandidate(candidate));
  const { pending, run, router } = useAction();
  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));
  const editing = Boolean(candidate);

  function submit() {
    const input: CandidateInput = { ...f, id: candidate?.id, source: f.source as CandidateInput["source"] };
    run(
      async () => {
        const r = await upsertCandidate(input);
        if (r.ok && !editing) router.push(`/candidats-poei/${r.id}`);
        return r;
      },
      editing ? "Fiche enregistrée." : "Candidat créé.",
      () => setOpen(false),
    );
  }

  const text = (k: keyof Form, label: string, q?: string, area = false) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {q && <p className="text-[11px] text-muted-foreground">« {q} »</p>}
      {area ? <Textarea rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} /> : <Input value={f[k]} onChange={(e) => set(k, e.target.value)} />}
    </div>
  );
  const select = (k: keyof Form, label: string, options: readonly { code: string; label: string }[], q?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {q && <p className="text-[11px] text-muted-foreground">« {q} »</p>}
      <Select value={f[k]} onValueChange={(v) => set(k, v)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromCandidate(candidate)); }}>
      <DialogTrigger asChild>
        {trigger ?? (editing ? (
          <Button size="sm" variant="outline"><Pencil className="mr-2 h-4 w-4" />Qualifier</Button>
        ) : (
          <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nouveau candidat</Button>
        ))}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Qualification du candidat" : "Nouveau candidat POEI"}</DialogTitle>
          <DialogDescription>Les questions dans l&apos;ordre de l&apos;appel. Le consentement se recueille sur la fiche (bouton dédié).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("firstName", "Prénom")}
          {text("lastName", "Nom *")}
          {text("phone", "Téléphone")}
          {text("email", "Email")}
          {text("city", "Ville")}
          {!editing && select("source", "Provenance", CANDIDATE_SOURCES.filter((s) => s.code !== "asso_pef"))}
          {text("frenchLevel", "Niveau de français")}
          {select("ftStatus", "1. France Travail", FT_STATUSES, question("ft_status"))}
          {text("ftId", "Identifiant France Travail")}
          {text("income", "2. Ressources", question("income"))}
          <div className="sm:col-span-2">{text("goal", "3. Projet", question("goal"), true)}</div>
          {text("targetJob", "4. Poste visé", question("target_job"))}
          {text("experience", "5. Expérience", question("experience"))}
          {text("availability", "6. Disponibilités", question("availability"))}
          {text("mobility", "7. Mobilité", question("mobility"))}
          {select("workPermit", "8. Autorisation de travail", WORK_PERMITS, question("work_permit"))}
          {text("constraints", "9. Contraintes", question("constraints"))}
          <div className="sm:col-span-2">{text("notes", "Notes", undefined, true)}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={pending || !f.lastName.trim()}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Statut, consentement, positionnement, journal, suppression ───────────────
export function CandidateStatusSelect({ candidateId, status, hasConsent }: { candidateId: string; status: string; hasConsent: boolean }) {
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<string>(CANDIDATE_LOST_REASONS[0]);
  const { pending, run } = useAction();
  const apply = (next: string, reason?: string) =>
    run(() => setCandidateStatus({ candidateId, status: next, lostReason: reason ?? null }), "Statut mis à jour.");
  return (
    <>
      <Select value={status} onValueChange={(v) => (v === "sans_suite" ? setLostOpen(true) : apply(v))} disabled={pending}>
        <SelectTrigger className={cn("h-8 w-[200px] text-xs", candidateStatusBadgeClass(status))} title="Changer le statut">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CANDIDATE_STATUSES.map((s) => (
            <SelectItem key={s.code} value={s.code} disabled={s.needsConsent && !hasConsent}>
              {s.label}<span className="ml-1 text-muted-foreground">— {s.needsConsent && !hasConsent ? "consentement requis" : s.hint}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Classer « Sans suite »</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Raison</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CANDIDATE_LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLostOpen(false)}>Annuler</Button>
              <Button onClick={() => { setLostOpen(false); apply("sans_suite", lostReason); }}>Confirmer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ConsentControl({ candidateId, consentAt, consentChannel }: { candidateId: string; consentAt: string | null; consentChannel: string | null }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<string>("telephone");
  const { pending, run } = useAction();
  if (consentAt) {
    const when = new Date(consentAt).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <ShieldCheck className="h-4 w-4" />Consentement recueilli le {when}{consentChannel ? ` (${CONSENT_CHANNELS.find((c) => c.code === consentChannel)?.label.toLowerCase() ?? consentChannel})` : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          disabled={pending}
          onClick={() => run(() => recordConsent({ candidateId, channel: "telephone", withdraw: true }), "Consentement retiré, fiche classée sans suite.")}
        >
          Retiré par la personne
        </Button>
      </div>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><ShieldCheck className="mr-2 h-4 w-4" />Consentement recueilli</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Consentement à la transmission</DialogTitle>
          <DialogDescription>
            Question posée : « {QUALIFICATION_QUESTIONS.find((q) => q.field === "consent")?.question} ». Ne cochez que si la personne a dit oui.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Comment ?</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{CONSENT_CHANNELS.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button disabled={pending} onClick={() => run(() => recordConsent({ candidateId, channel }), "Consentement enregistré.", () => setOpen(false))}>
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PlacementSelect({
  candidateId, placedLeadId, employers, hasConsent,
}: {
  candidateId: string;
  placedLeadId: string | null;
  employers: { id: string; label: string }[];
  hasConsent: boolean;
}) {
  const { pending, run } = useAction();
  return (
    <Select
      value={placedLeadId ?? "none"}
      onValueChange={(v) => run(() => setPlacement({ candidateId, leadId: v === "none" ? null : v }), v === "none" ? "Positionnement retiré." : "Candidat positionné.")}
      disabled={pending || (!hasConsent && !placedLeadId)}
    >
      <SelectTrigger className="w-full max-w-md" title={hasConsent ? "Restaurateur chez qui le candidat est présenté" : "Consentement requis avant de présenter le candidat"}>
        <SelectValue placeholder="Choisir un restaurateur" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Pas encore positionné —</SelectItem>
        {employers.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function CandidateEventDialog({ candidateId, nextAction, nextActionOn }: { candidateId: string; nextAction: string | null; nextActionOn: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("appel");
  const [outcome, setOutcome] = useState("joint");
  const [note, setNote] = useState("");
  const [na, setNa] = useState(nextAction ?? "");
  const [naOn, setNaOn] = useState(nextActionOn ?? "");
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" />Noter un contact</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Noter un contact</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CANDIDATE_EVENT_KINDS.map((k) => <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={outcome} onValueChange={setOutcome} disabled={kind === "note"}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CANDIDATE_EVENT_OUTCOMES.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Textarea rows={3} placeholder="Ce qui a été dit…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input placeholder="Prochaine action (ex. rappeler après 18 h)" value={na} onChange={(e) => setNa(e.target.value)} />
            <Input type="date" value={naOn} onChange={(e) => setNaOn(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => logCandidateEvent({
                    candidateId, kind, outcome: kind === "note" ? null : outcome, note: note || null,
                    nextAction: na || null, nextActionOn: naOn || null,
                  }),
                  "Contact noté.",
                  () => { setOpen(false); setNote(""); },
                )
              }
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCandidateButton({ candidateId, name }: { candidateId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run, router } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-red-600"><Trash2 className="mr-2 h-4 w-4" />Supprimer la fiche</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Supprimer {name} ?</DialogTitle>
          <DialogDescription>La fiche candidat et son journal sont effacés. La fiche apprenant ou le lead d&apos;origine ne sont pas touchés.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => deleteCandidate({ candidateId }), "Fiche supprimée.", () => router.push("/candidats-poei"))}
          >
            Supprimer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

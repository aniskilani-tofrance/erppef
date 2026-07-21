"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { proposePlan, commitProposal } from "@/app/(app)/groupes/actions";
import type { Proposal } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProposalReview } from "./proposal-review";

type Program = {
  id: string;
  code: string;
  name: string;
  total_hours: number;
  default_weekly_hours: number | null;
  default_funder_id: string | null;
  level: string | null;
};
type Funder = { id: string; name: string; color: string };

export function GroupWizard({ programs, funders }: { programs: Program[]; funders: Funder[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [programId, setProgramId] = useState("");
  const [funderId, setFunderId] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const program = programs.find((p) => p.id === programId);

  function selectProgram(id: string) {
    setProgramId(id);
    const p = programs.find((x) => x.id === id);
    if (p) {
      if (p.default_funder_id) setFunderId(p.default_funder_id);
      if (!name) {
        const month = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        setName(`${p.name} — ${month.charAt(0).toUpperCase()}${month.slice(1)}`);
      }
    }
  }

  function handlePropose() {
    if (!programId || !startsOn) {
      toast.error("Choisissez un dispositif et une date de début.");
      return;
    }
    startTransition(async () => {
      const result = await proposePlan({
        programId,
        startsOn,
        expectedHeadcount: headcount ? Number(headcount) : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProposal(result.proposal);
    });
  }

  function handleCommit(p: Proposal, trainerId: string | null, roomId: string | null) {
    startTransition(async () => {
      const result = await commitProposal({
        name,
        programId,
        funderId: funderId || null,
        startsOn,
        capacity: headcount ? Number(headcount) : null,
        notes: null,
        trainerId,
        roomId,
        weeklyPattern: p.weeklyPattern,
        totalHours: p.totals.hours,
        endsOn: p.totals.endsOn,
        sessions: p.sessions.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Groupe créé : planning généré, salle réservée, formateur affecté.");
      router.push(`/groupes/${result.groupId}`);
    });
  }

  if (proposal) {
    return (
      <ProposalReview
        proposal={proposal}
        groupName={name}
        pending={pending}
        onBack={() => setProposal(null)}
        onCommit={handleCommit}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Informations du groupe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Dispositif</Label>
            <Select value={programId} onValueChange={selectProgram}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un dispositif" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({Number(p.total_hours)} h)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Financeur</Label>
            <Select value={funderId} onValueChange={setFunderId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un financeur" />
              </SelectTrigger>
              <SelectContent>
                {funders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                      {f.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nom du groupe</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="PEF A1 — Septembre 2026" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="starts">Date de début</Label>
            <Input id="starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="headcount">Effectif attendu</Label>
            <Input id="headcount" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="12" />
          </div>
        </div>

        {program && (
          <p className="text-sm text-muted-foreground">
            {Number(program.total_hours)} h au total
            {program.default_weekly_hours ? ` · rythme par défaut ${Number(program.default_weekly_hours)} h/semaine` : ""}
            {program.level ? ` · niveau ${program.level}` : ""}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={handlePropose} disabled={pending}>
            {pending ? "Calcul en cours…" : "Proposer un planning optimal"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

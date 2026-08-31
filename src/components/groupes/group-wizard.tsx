"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { proposePlan, commitProposal } from "@/app/(app)/groupes/actions";
import type { Proposal, SlotPattern } from "@/lib/engine/types";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  entry_level?: string | null;
  preferred_trainer_id?: string | null;
};
export type WizardLearner = { id: string; name: string; level: string | null; busy: boolean };

// Un « Alpha avancé » rejoint un groupe d'entrée « Alpha », un « Post-alpha (A1.1 en cours) »
// un groupe « Post-alpha » ; les niveaux CECRL se comparent à l'exact (A1.1 ≠ A1).
export function levelMatches(learnerLevel: string | null, entryLevel: string | null): boolean {
  if (!learnerLevel || !entryLevel) return false;
  if (learnerLevel === entryLevel) return true;
  return ["Pré-alpha", "Alpha", "Post-alpha"].includes(entryLevel) && learnerLevel.startsWith(entryLevel);
}
type Funder = { id: string; name: string; color: string };
type Option = { id: string; name: string };

// Calendriers type : le cadrage (rythme × jours) génère le motif hebdo
// à l'intérieur des fenêtres d'ouverture (9h-12h / 13h-20h).
const RHYTHMS = [
  { key: "matins", label: "Matins (9h-12h)", slots: [{ start: "09:00", end: "12:00" }] },
  { key: "apres-midis", label: "Après-midis (13h-16h)", slots: [{ start: "13:00", end: "16:00" }] },
  { key: "journees", label: "Journées (9h-12h et 13h-16h)", slots: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "16:00" }] },
  { key: "custom", label: "Personnalisé", slots: [] },
] as const;
type RhythmKey = (typeof RHYTHMS)[number]["key"];

const WEEKDAYS = [
  { value: 1, label: "Lun" }, { value: 2, label: "Mar" }, { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" }, { value: 5, label: "Ven" }, { value: 6, label: "Sam" },
] as const;

export function GroupWizard({
  programs,
  funders,
  trainers = [],
  rooms = [],
  learners = [],
}: {
  programs: Program[];
  funders: Funder[];
  trainers?: Option[];
  rooms?: Option[];
  learners?: WizardLearner[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [programId, setProgramId] = useState("");
  const [funderId, setFunderId] = useState("");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [rhythm, setRhythm] = useState<RhythmKey | "auto">("auto");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [preferredTrainerId, setPreferredTrainerId] = useState("auto");
  const [preferredRoomId, setPreferredRoomId] = useState("auto");
  // Créneaux personnalisés (rhythm === "custom")
  const [customSlots, setCustomSlots] = useState<SlotPattern[] | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [enrollIds, setEnrollIds] = useState<Set<string>>(new Set());

  const program = programs.find((p) => p.id === programId);

  // Groupe de niveau : les apprenants du niveau d'entrée SANS groupe actif, cochés d'office
  const levelCandidates = program?.entry_level
    ? learners.filter((l) => !l.busy && levelMatches(l.level, program.entry_level ?? null))
    : [];

  function selectProgram(id: string) {
    setProgramId(id);
    const p = programs.find((x) => x.id === id);
    if (p) {
      setEnrollIds(new Set(
        p.entry_level
          ? learners.filter((l) => !l.busy && levelMatches(l.level, p.entry_level ?? null)).map((l) => l.id)
          : [],
      ));
      if (p.default_funder_id) setFunderId(p.default_funder_id);
      if (p.preferred_trainer_id) setPreferredTrainerId(p.preferred_trainer_id);
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
    if (rhythm === "custom" && customSlots?.some((s) => s.end <= s.start)) {
      toast.error("Un créneau se termine avant de commencer : corrigez les horaires.");
      return;
    }
    // Motif hebdo issu du cadrage : rythme × jours retenus (ordre chronologique)
    let weeklyPattern: SlotPattern[] | undefined;
    if (rhythm === "custom") {
      weeklyPattern = customSlots?.length ? customSlots : undefined;
    } else if (rhythm !== "auto") {
      const def = RHYTHMS.find((r) => r.key === rhythm)!;
      weeklyPattern = days
        .sort((a, b) => a - b)
        .flatMap((d) =>
          def.slots.map((slot) => ({ weekday: d as SlotPattern["weekday"], start: slot.start, end: slot.end })),
        );
      if (!weeklyPattern.length) {
        toast.error("Choisissez au moins un jour de cours.");
        return;
      }
    }
    startTransition(async () => {
      const result = await proposePlan({
        programId,
        startsOn,
        expectedHeadcount: headcount ? Number(headcount) : undefined,
        skipSchoolHolidays: skipHolidays,
        weeklyPattern,
        preferredTrainerId: preferredTrainerId !== "auto" ? preferredTrainerId : undefined,
        preferredRoomId: preferredRoomId !== "auto" ? preferredRoomId : undefined,
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
        skipSchoolHolidays: skipHolidays,
        sessions: p.sessions.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
        enrollLearnerIds: [...enrollIds],
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        enrollIds.size > 0
          ? `Groupe créé : planning généré et ${enrollIds.size} apprenant${enrollIds.size > 1 ? "s" : ""} inscrit${enrollIds.size > 1 ? "s" : ""}.`
          : "Groupe créé : planning généré, salle réservée, formateur affecté.",
      );
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

        {/* Groupe de NIVEAU : inscription en un geste des apprenants du niveau d'entrée */}
        {program?.entry_level && (
          <div className="space-y-2 rounded-md border p-4">
            <p className="text-sm font-medium">
              Groupe de niveau {program.entry_level}
              <span className="ml-2 font-normal text-muted-foreground">
                {levelCandidates.length} apprenant{levelCandidates.length > 1 ? "s" : ""} de ce niveau sans groupe actif — {enrollIds.size} sélectionné{enrollIds.size > 1 ? "s" : ""}
              </span>
            </p>
            {levelCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun apprenant disponible à ce niveau (le niveau vient du test de positionnement ou de la fiche).
              </p>
            ) : (
              <div className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                {levelCandidates.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={enrollIds.has(l.id)}
                      onChange={(e) => {
                        setEnrollIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(l.id);
                          else next.delete(l.id);
                          return next;
                        });
                      }}
                    />
                    <span>{l.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{l.level}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Cadrage du calendrier</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rythme</Label>
              <Select value={rhythm} onValueChange={(v) => setRhythm(v as typeof rhythm)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatique (selon le dispositif)</SelectItem>
                  {RHYTHMS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {rhythm !== "auto" && rhythm !== "custom" && (
              <div className="space-y-2">
                <Label>Jours de cours</Label>
                <div className="flex flex-wrap gap-3 pt-1">
                  {WEEKDAYS.map((d) => (
                    <label key={d.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={days.includes(d.value)}
                        onCheckedChange={(c) =>
                          setDays((prev) =>
                            c === true ? [...prev, d.value] : prev.filter((x) => x !== d.value),
                          )
                        }
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Décochez un jour pour limiter les déplacements des apprenants.
                </p>
              </div>
            )}
          </div>

          {rhythm === "custom" && (
            <div className="space-y-2 pt-1">
              {(customSlots ?? []).map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={String(slot.weekday)}
                    onValueChange={(v) =>
                      setCustomSlots((s) =>
                        (s ?? []).map((x, j) => (j === i ? { ...x, weekday: Number(v) as SlotPattern["weekday"] } : x)),
                      )
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const).map((d, idx) => (
                        <SelectItem key={d} value={String(idx + 1)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time" className="w-28" value={slot.start} step={900}
                    onChange={(e) =>
                      setCustomSlots((s) => (s ?? []).map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                    }
                  />
                  <span className="text-sm text-muted-foreground">→</span>
                  <Input
                    type="time" className="w-28" value={slot.end} step={900}
                    onChange={(e) =>
                      setCustomSlots((s) => (s ?? []).map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setCustomSlots((s) => (s ?? []).filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline" size="sm"
                onClick={() =>
                  setCustomSlots((s) => [...(s ?? []), { weekday: 1, start: "09:00", end: "12:00" }])
                }
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Ajouter un créneau
              </Button>
              <p className="text-xs text-muted-foreground">
                Horaires d'ouverture : 9h-12h et 13h-20h. Un créneau en dehors sera signalé.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Formateur à privilégier</Label>
              <Select value={preferredTrainerId} onValueChange={setPreferredTrainerId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Laisser le moteur choisir</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Salle à privilégier</Label>
              <Select value={preferredRoomId} onValueChange={setPreferredRoomId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Laisser le moteur choisir</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ces préférences guident le moteur sans le contraindre : s'il ne peut pas les
            respecter (conflit, indisponibilité), il propose la meilleure alternative en
            expliquant pourquoi.
          </p>
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipHolidays} onCheckedChange={(c) => setSkipHolidays(c === true)} />
            Pas de cours pendant les vacances scolaires (zone C)
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            {skipHolidays
              ? "Le planning sautera les vacances scolaires, les jours fériés et les fermetures de l'organisme."
              : "Le groupe aura cours pendant les vacances scolaires ; jours fériés et fermetures de l'organisme restent exclus."}
          </p>
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

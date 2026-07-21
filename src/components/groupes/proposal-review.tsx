"use client";

import { useState } from "react";
import type { Proposal, RankedRoom, RankedTrainer } from "@/lib/engine/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

// Écran de revue : la proposition du moteur, modifiable avant validation.
// Rien n'est écrit tant que « Valider » n'est pas cliqué.
export function ProposalReview({
  proposal,
  groupName,
  pending,
  onBack,
  onCommit,
}: {
  proposal: Proposal;
  groupName: string;
  pending: boolean;
  onBack: () => void;
  onCommit: (p: Proposal, trainerId: string | null, roomId: string | null) => void;
}) {
  const [trainerId, setTrainerId] = useState<string | null>(proposal.trainer?.trainerId ?? null);
  const [roomId, setRoomId] = useState<string | null>(proposal.room?.roomId ?? null);

  const selectedTrainer = proposal.trainerAlternatives.find((t) => t.trainerId === trainerId);
  const cost = selectedTrainer ? selectedTrainer.projectedCost : null;
  const canCommit = trainerId !== null && roomId !== null && proposal.sessions.length > 0;

  const first = proposal.sessions[0];
  const jours = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Proposition du moteur — {groupName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Séances" value={String(proposal.sessions.length)} />
            <Stat label="Volume" value={`${proposal.totals.hours} h`} />
            <Stat label="Fin estimée" value={proposal.totals.endsOn ? formatDate(proposal.totals.endsOn) : "—"} />
            <Stat
              label="Coût pédagogique"
              value={cost != null ? `${cost.toLocaleString("fr-FR")} €` : "—"}
              highlight
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Rythme :{" "}
            {proposal.weeklyPattern
              .map((s) => `${jours[s.weekday]} ${s.start}–${s.end}`)
              .join(", ")}
            {first && ` · première séance le ${formatDate(first.localDate)}`}
          </div>

          {proposal.totals.skippedClosures.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {proposal.totals.skippedClosures.length} jour(s) sauté(s) (vacances scolaires, fériés) —
              ex. {proposal.totals.skippedClosures[0].label} le {formatDate(proposal.totals.skippedClosures[0].date)}.
            </p>
          )}

          {proposal.warnings.map((w) => (
            <Alert key={w.code}>
              <AlertDescription>{w.message}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proposal.trainerAlternatives.map((t) => (
              <TrainerOption
                key={t.trainerId}
                trainer={t}
                selected={t.trainerId === trainerId}
                recommended={t.trainerId === proposal.trainer?.trainerId}
                onSelect={() => t.hardViolations.length === 0 && setTrainerId(t.trainerId)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proposal.roomAlternatives.map((r) => (
              <RoomOption
                key={r.roomId}
                room={r}
                selected={r.roomId === roomId}
                recommended={r.roomId === proposal.room?.roomId}
                onSelect={() => r.hardViolations.length === 0 && setRoomId(r.roomId)}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={pending}>
          ← Modifier les informations
        </Button>
        <Button onClick={() => onCommit(proposal, trainerId, roomId)} disabled={!canCommit || pending}>
          {pending ? "Création…" : `Valider : créer le groupe et ${proposal.sessions.length} séances`}
        </Button>
      </div>
    </div>
  );
}

function TrainerOption({
  trainer,
  selected,
  recommended,
  onSelect,
}: {
  trainer: RankedTrainer;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const eligible = trainer.hardViolations.length === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!eligible}
      className={cn(
        "w-full rounded-md border p-3 text-left transition-colors",
        selected && "border-primary bg-primary/5",
        !eligible && "cursor-not-allowed opacity-60",
        eligible && !selected && "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {eligible ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium">{trainer.name}</span>
          <Badge variant="outline" className="text-xs">
            {trainer.contractType === "salarie" ? "Salarié" : "Vacataire"}
          </Badge>
          {recommended && <Badge className="text-xs">Recommandé</Badge>}
        </div>
        <span className="text-sm font-semibold">
          {trainer.projectedCost.toLocaleString("fr-FR")} €
        </span>
      </div>
      {trainer.hardViolations.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-destructive">
          {trainer.hardViolations.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}
      {trainer.softNotes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {trainer.softNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </button>
  );
}

function RoomOption({
  room,
  selected,
  recommended,
  onSelect,
}: {
  room: RankedRoom;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const eligible = room.hardViolations.length === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!eligible}
      className={cn(
        "w-full rounded-md border p-3 text-left transition-colors",
        selected && "border-primary bg-primary/5",
        !eligible && "cursor-not-allowed opacity-60",
        eligible && !selected && "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {eligible ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium">{room.name}</span>
          {recommended && <Badge className="text-xs">Recommandée</Badge>}
        </div>
        <span className="text-sm text-muted-foreground">{room.capacity} places</span>
      </div>
      {room.hardViolations.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-destructive">
          {room.hardViolations.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", highlight && "border-primary bg-primary/5")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cancelSession, deleteSession, updateSession, type CalendarSession } from "@/app/(app)/planning/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { utcToLocalTime } from "@/lib/dates";
import { CANCEL_REASONS, CANCEL_REASON_LABELS, type CancelReason } from "@/lib/sessions/cancellation";
import { SessionKit } from "./session-kit";

type Option = { id: string; name: string };
const NONE = "none";

// Sheet d'édition d'une séance : remplacement de formateur, changement de salle, annulation
// avec motif (et décalage des kits sur les séances suivantes).
export function SessionSheet({
  session,
  canEdit,
  trainers,
  rooms,
  onClose,
  onChanged,
}: {
  session: CalendarSession | null;
  canEdit: boolean;
  trainers: Option[];
  rooms: Option[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [trainerId, setTrainerId] = useState<string>(NONE);
  const [coTrainerId, setCoTrainerId] = useState<string>(NONE);
  const [roomId, setRoomId] = useState<string>(NONE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [shiftKits, setShiftKits] = useState(true);
  const [pending, startTransition] = useTransition();

  // Nouvelle séance ouverte : on réaligne les champs pendant le rendu (pattern React
  // « adjusting state when a prop changes »), sans effet.
  const [prevSession, setPrevSession] = useState<CalendarSession | null>(session);
  if (session !== prevSession) {
    setPrevSession(session);
    setTrainerId(session?.trainerId ?? NONE);
    setCoTrainerId(session?.coTrainerId ?? NONE);
    setRoomId(session?.roomId ?? NONE);
    setConfirmDelete(false);
    setCancelling(false);
    setReason("");
    setNote("");
    setShiftKits(true);
  }

  if (!session) return <Sheet open={false} />;

  function save() {
    startTransition(async () => {
      const result = await updateSession({
        sessionId: session!.id,
        trainerId: trainerId === NONE ? null : trainerId,
        coTrainerId: coTrainerId === NONE ? null : coTrainerId,
        roomId: roomId === NONE ? null : roomId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Séance mise à jour.");
      onChanged();
    });
  }

  function cancel() {
    if (!reason) {
      toast.error("Choisissez un motif d'annulation.");
      return;
    }
    startTransition(async () => {
      const result = await cancelSession({ sessionId: session!.id, reason, note, shiftKits });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message, { duration: 8000 });
      onChanged();
    });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{session.groupName}</SheetTitle>
          <SheetDescription>
            {new Date(session.startsAt).toLocaleDateString("fr-FR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              timeZone: "Europe/Paris",
            })}{" "}
            · {utcToLocalTime(session.startsAt)} – {utcToLocalTime(session.endsAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>Formateur</Label>
            <Select value={trainerId} onValueChange={setTrainerId} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun</SelectItem>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Co-animation (stagiaire ou second formateur)</Label>
            <Select value={coTrainerId} onValueChange={setCoTrainerId} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Personne</SelectItem>
                {trainers.filter((t) => t.id !== trainerId).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Salle</Label>
            <Select value={roomId} onValueChange={setRoomId} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SessionKit sessionId={session.id} />

          <Link
            href={`/seances/${session.id}/emargement`}
            className="block text-sm font-medium hover:underline"
          >
            Feuille d&apos;émargement →
          </Link>

          <Link
            href={`/groupes/${session.groupId}`}
            className="block text-sm text-muted-foreground hover:underline"
          >
            Voir la fiche du groupe →
          </Link>

          {canEdit && (
            <>
              <div className="flex gap-2 pt-2">
                <Button onClick={save} disabled={pending || cancelling} className="flex-1">
                  {pending && !cancelling ? "Enregistrement…" : "Enregistrer"}
                </Button>
                {session.status === "planifiee" && !cancelling && (
                  <Button variant="destructive" onClick={() => setCancelling(true)} disabled={pending}>
                    Annuler la séance
                  </Button>
                )}
              </div>
              {cancelling && (
                <div className="space-y-3 rounded-md border border-destructive/40 p-3">
                  <div className="space-y-2">
                    <Label>Motif de l&apos;annulation</Label>
                    <Select value={reason} onValueChange={(v) => setReason(v as CancelReason)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un motif" />
                      </SelectTrigger>
                      <SelectContent>
                        {CANCEL_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {CANCEL_REASON_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    placeholder={reason === "autre" ? "Précisez le motif (obligatoire)" : "Précision (facultatif)"}
                  />
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={shiftKits} onCheckedChange={(c) => setShiftKits(c === true)} className="mt-0.5" />
                    <span>
                      Décaler les kits : le kit de cette séance passe à la séance suivante du groupe, et les kits suivants d&apos;autant.
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={cancel} disabled={pending} className="flex-1">
                      {pending ? "Annulation…" : "Confirmer l'annulation"}
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelling(false)} disabled={pending}>
                      Retour
                    </Button>
                  </div>
                </div>
              )}
              {/* Suppression définitive en deux temps ; refusée côté serveur si la séance est émargée. */}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  startTransition(async () => {
                    const result = await deleteSession(session!.id);
                    if (!result.ok) {
                      toast.error(result.error);
                      setConfirmDelete(false);
                      return;
                    }
                    toast.success("Séance supprimée définitivement.");
                    onChanged();
                  });
                }}
                className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
              >
                {confirmDelete
                  ? "Cliquez à nouveau pour confirmer la suppression DÉFINITIVE"
                  : "Supprimer définitivement cette séance (préférez « Annuler » pour garder la trace)"}
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { updateSession, type CalendarSession } from "@/app/(app)/planning/actions";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { utcToLocalTime } from "@/lib/dates";

type Option = { id: string; name: string };
const NONE = "none";

// Sheet d'édition d'une séance : remplacement de formateur, changement de salle, annulation.
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
  const [roomId, setRoomId] = useState<string>(NONE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setTrainerId(session?.trainerId ?? NONE);
    setRoomId(session?.roomId ?? NONE);
  }, [session]);

  if (!session) return <Sheet open={false} />;

  function save(status: "planifiee" | "annulee") {
    startTransition(async () => {
      const result = await updateSession({
        sessionId: session!.id,
        trainerId: trainerId === NONE ? null : trainerId,
        roomId: roomId === NONE ? null : roomId,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "annulee" ? "Séance annulée." : "Séance mise à jour.");
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
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save("planifiee")} disabled={pending} className="flex-1">
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button variant="destructive" onClick={() => save("annulee")} disabled={pending}>
                Annuler la séance
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { addMeetingSlot } from "@/app/(app)/apprenants/admission/actions";
import { placesSummary } from "@/lib/inscription/meeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Créneaux d'un même lien : chaque créneau est une réunion à part entière (date, heure, places
// maximum, convoqués). Le lien d'inscription propose leurs jours et heures, la personne choisit.
// Un créneau ajouté reprend le titre, le lieu et le test oral de la réunion d'où on le crée.

export type SlotRow = {
  id: string;
  whenText: string; // « samedi 7 novembre 2026 à 14h00 »
  taken: number;
  capacity: number | null;
  signupOpen: boolean;
  current: boolean;
};

export function MeetingSlotsCard({
  meetingId,
  slots,
  defaults,
}: {
  meetingId: string;
  slots: SlotRow[];
  defaults: { startTime: string; endTime: string; capacity: string };
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [capacity, setCapacity] = useState(defaults.capacity);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const result = await addMeetingSlot({
        meetingId,
        date,
        startTime,
        endTime: endTime || null,
        capacity: Number(capacity),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Créneau ajouté : le même lien le propose.");
      setOpen(false);
      setDate("");
      router.refresh();
    });
  }

  const several = slots.length > 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Plusieurs jours ou heures sur le même lien</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <CalendarPlus className="mr-1.5 h-4 w-4" />
                Ajouter un créneau
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un créneau</DialogTitle>
                <DialogDescription>
                  Une autre date ou une autre heure pour la même réunion : mêmes lieu et test oral, ses propres places et ses propres convoqués. Le lien d&apos;inscription le propose avec les autres.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="slot-date">Date</Label>
                    <Input id="slot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slot-start">Début</Label>
                    <Input id="slot-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slot-end">Fin (optionnel)</Label>
                    <Input id="slot-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-capacity">Places maximum (apprenants)</Label>
                  <Input id="slot-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="20" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
                  <Button onClick={submit} disabled={pending || !date || !startTime || !capacity.trim()}>
                    {pending ? "Ajout…" : "Ajouter"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-xs text-muted-foreground">
          {several
            ? "La personne choisit son jour et son heure sur la page du lien, parmi les créneaux ouverts qui ont encore des places. Chaque créneau se gère comme une réunion : convoqués, heures de convocation, présence."
            : "Un seul créneau pour l'instant. Ajoutez d'autres dates ou heures : le même lien les propose, et la personne choisit."}
        </p>
      </CardHeader>
      {several && (
        <CardContent>
          <ul className="divide-y text-sm">
            {slots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {s.current ? (
                    <span className="font-medium">{s.whenText}</span>
                  ) : (
                    <Link href={`/apprenants/reunions/${s.id}`} className="font-medium hover:underline">{s.whenText}</Link>
                  )}
                  {s.current && <span className="ml-2 text-xs text-muted-foreground">(cette réunion)</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{placesSummary(s.capacity, s.taken)}</span>
                  <Badge
                    variant="outline"
                    className={s.signupOpen ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-gray-100 text-gray-600"}
                  >
                    {s.signupOpen ? "ouvert" : "fermé"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

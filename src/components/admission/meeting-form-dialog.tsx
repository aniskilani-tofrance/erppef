"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { deleteInfoMeeting, upsertInfoMeeting } from "@/app/(app)/apprenants/admission/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_PARALLEL, MAX_STEP_MINUTES, MIN_STEP_MINUTES, staggerCapacity, staggerLastArrival, staggerPerHour,
} from "@/lib/admission/convocation";

export type MeetingFormValues = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD (heure de Paris)
  startTime: string; // HH:MM
  endTime: string; // "" = non renseignée
  roomId: string; // "none" = pas de salle
  location: string;
  capacity: string; // nombre MAXIMUM d'apprenants ; "" = illimité (impossible si l'inscription par lien est ouverte)
  notes: string;
  signupOpen: boolean; // inscription en ligne par lien ouverte
  oralTestIncluded: boolean; // la réunion comprend un test oral individuel
  staggerMinutes: string; // accueil échelonné : minutes entre deux arrivées ; "" = tous à l'heure de la réunion
  staggerParallel: string; // personnes accueillies en même temps (accueillants)
};

const EMPTY: MeetingFormValues = {
  title: "Réunion d'information",
  date: "",
  startTime: "14:00",
  endTime: "16:00",
  roomId: "none",
  location: "",
  capacity: "",
  notes: "",
  signupOpen: false,
  oralTestIncluded: true,
  staggerMinutes: "",
  staggerParallel: "1",
};

// « 17:00 » + 10 minutes → « 17h10 » (aperçu de l'accueil échelonné).
function formatPlus(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}h${String(total % 60).padStart(2, "0")}`;
}

// Création / modification d'une réunion d'information. À la création, on arrive
// directement sur la page de la réunion pour ajouter les convoqués.
export function MeetingFormDialog({
  rooms,
  initial,
  invitedCount = 0,
}: {
  rooms: { id: string; name: string }[];
  initial?: MeetingFormValues;
  invitedCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MeetingFormValues>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const set = <K extends keyof MeetingFormValues>(key: K, v: MeetingFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  // Accueil échelonné : une arrivée toutes les N minutes, K en même temps (3 accueillants → 3 à 17h00,
  // 3 à 17h10…). Places conseillées d'après l'heure de fin ; dernière arrivée d'après les places.
  const staggerMin = Number(values.staggerMinutes);
  const staggerPar = Math.max(1, Number(values.staggerParallel) || 1);
  const stagger =
    values.staggerMinutes.trim() && Number.isInteger(staggerMin) && staggerMin >= MIN_STEP_MINUTES && staggerMin <= MAX_STEP_MINUTES
      ? { minutes: staggerMin, parallel: Math.min(staggerPar, MAX_PARALLEL) }
      : null;
  const suggestedCapacity = stagger ? staggerCapacity(values.startTime, values.endTime || null, stagger.minutes, stagger.parallel) : null;
  const capacityNumber = Number(values.capacity);
  const lastArrival = stagger && capacityNumber > 0 ? staggerLastArrival(values.startTime, stagger.minutes, stagger.parallel, capacityNumber) : null;

  function submit() {
    startTransition(async () => {
      const result = await upsertInfoMeeting({
        id: values.id,
        title: values.title.trim(),
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime || null,
        roomId: values.roomId === "none" ? null : values.roomId,
        location: values.location.trim() || null,
        capacity: values.capacity.trim() ? Number(values.capacity) : null,
        notes: values.notes.trim() || null,
        signupOpen: values.signupOpen,
        oralTestIncluded: values.oralTestIncluded,
        staggerMinutes: stagger ? stagger.minutes : null,
        staggerParallel: stagger ? stagger.parallel : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isEdit
          ? "Réunion mise à jour."
          : values.signupOpen
            ? "Réunion créée — le lien d'inscription est prêt à envoyer."
            : "Réunion créée — ajoutez maintenant les convoqués.",
      );
      setOpen(false);
      if (isEdit) router.refresh();
      else router.push(`/apprenants/reunions/${result.id}`);
    });
  }

  function remove() {
    if (!initial?.id) return;
    if (invitedCount > 0 && !window.confirm(`Supprimer cette réunion et ses ${invitedCount} convocation${invitedCount > 1 ? "s" : ""} ?`)) return;
    startTransition(async () => {
      const result = await deleteInfoMeeting(initial.id!);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Réunion supprimée.");
      setOpen(false);
      router.push("/apprenants/admission");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" size="sm">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Modifier
          </Button>
        ) : (
          <Button size="sm">
            <CalendarPlus className="mr-2 h-4 w-4" />
            Nouvelle réunion
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la réunion" : "Nouvelle réunion d'information"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Début</Label>
              <Input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin (optionnel)</Label>
              <Input type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Salle</Label>
              <Select value={values.roomId} onValueChange={(v) => set("roomId", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pas de salle / ailleurs</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Places maximum (apprenants){values.signupOpen ? "" : " — optionnel"}</Label>
              <Input type="number" min={1} value={values.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="20" />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="meeting-signup-open">Inscription en ligne par lien</Label>
                <p className="text-xs text-muted-foreground">
                  Un lien à envoyer sur WhatsApp : chaque personne s&apos;inscrit seule en 2 minutes, jusqu&apos;au nombre maximum de places. Le lien est sur la page de la réunion.
                </p>
              </div>
              <Switch
                id="meeting-signup-open"
                checked={values.signupOpen}
                onCheckedChange={(v) => set("signupOpen", v)}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="meeting-oral-test">Test oral individuel inclus</Label>
                <p className="text-xs text-muted-foreground">
                  Annoncé à la personne (« un petit test oral avec vous, ce n&apos;est pas un examen »). Il se saisit ensuite en 20 secondes sur la page de la réunion.
                </p>
              </div>
              <Switch
                id="meeting-oral-test"
                checked={values.oralTestIncluded}
                onCheckedChange={(v) => set("oralTestIncluded", v)}
              />
            </div>
            {values.signupOpen && !values.capacity.trim() && (
              <p className="text-xs font-medium text-destructive">Indiquez le nombre maximum de places pour ouvrir l&apos;inscription par lien.</p>
            )}
          </div>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label>Accueil échelonné (facultatif)</Label>
              <p className="text-xs text-muted-foreground">
                Chaque personne inscrite par le lien reçoit SON heure d&apos;arrivée : la première heure libre, premier inscrit premier servi. Elle la voit en fin d&apos;inscription et la retrouve dans la convocation et le rappel. Vide : tout le monde à l&apos;heure de la réunion.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meeting-stagger-minutes">Une arrivée toutes les (minutes)</Label>
                <Input
                  id="meeting-stagger-minutes"
                  type="number"
                  min={MIN_STEP_MINUTES}
                  max={MAX_STEP_MINUTES}
                  step={5}
                  value={values.staggerMinutes}
                  onChange={(e) => set("staggerMinutes", e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-stagger-parallel">Personnes accueillies en même temps</Label>
                <Input
                  id="meeting-stagger-parallel"
                  type="number"
                  min={1}
                  max={MAX_PARALLEL}
                  value={values.staggerParallel}
                  onChange={(e) => set("staggerParallel", e.target.value)}
                  placeholder="3"
                />
              </div>
            </div>
            {stagger && (
              <div className="space-y-1 text-xs">
                <p>
                  {stagger.parallel} à {values.startTime.replace(":", "h")}, {stagger.parallel} à{" "}
                  {formatPlus(values.startTime, stagger.minutes)}… soit {staggerPerHour(stagger.minutes, stagger.parallel) / stagger.parallel} par accueillant et{" "}
                  {staggerPerHour(stagger.minutes, stagger.parallel)} par heure.
                  {lastArrival ? ` Avec ${capacityNumber} places : dernière arrivée à ${lastArrival.replace(":", "h")}.` : ""}
                </p>
                {suggestedCapacity !== null && suggestedCapacity !== capacityNumber && (
                  <p>
                    Jusqu&apos;à {values.endTime.replace(":", "h")}, cela fait {suggestedCapacity} places.{" "}
                    <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => set("capacity", String(suggestedCapacity))}>
                      Mettre {suggestedCapacity} places
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Lieu / adresse (dans le message envoyé)</Label>
            <Input
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes internes (optionnel)</Label>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Ordre du jour, qui anime, documents à apporter…" />
          </div>
          <div className="flex justify-between gap-2">
            {isEdit ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-destructive">
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Supprimer
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
              <Button
                onClick={submit}
                disabled={
                  pending ||
                  !values.title.trim() ||
                  !values.date ||
                  !values.startTime ||
                  (values.signupOpen && !values.capacity.trim()) ||
                  (values.staggerMinutes.trim() !== "" && !stagger)
                }
              >
                {pending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer la réunion"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

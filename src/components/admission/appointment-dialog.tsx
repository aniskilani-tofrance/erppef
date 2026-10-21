"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Loader2, X } from "lucide-react";
import {
  listAdmissionFreeSlots,
  setAdmissionAppointmentStatus,
  upsertAdmissionAppointment,
} from "@/app/(app)/apprenants/admission/actions";
import {
  APPOINTMENT_DURATIONS,
  APPOINTMENT_KINDS,
  APPOINTMENT_MODES,
  DEFAULT_APPOINTMENT_ADDRESS,
  DEFAULT_APPOINTMENT_MINUTES,
  appointmentModeLabel,
  dayLabel,
  durationMinutes,
  timeOf,
  type AppointmentKind,
  type AppointmentMode,
} from "@/lib/admission/appointments";
import { groupSlotsByDay, slotLabel, type FreeSlot } from "@/lib/admission/slots";
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Un rendez-vous d'admission prévu, tel que la page le transmet au dialogue.
export type AppointmentView = {
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  kind: string;
  mode: string;
  location: string | null;
  notes: string | null;
};

type FormValues = {
  date: string;
  startTime: string;
  duration: string;
  kind: AppointmentKind;
  mode: AppointmentMode;
  location: string;
  notes: string;
};

function todayInParis(): string {
  return utcToLocalDate(new Date().toISOString());
}

function blank(kind: AppointmentKind = "entretien"): FormValues {
  return {
    date: todayInParis(),
    startTime: "10:00",
    duration: String(DEFAULT_APPOINTMENT_MINUTES),
    kind,
    mode: "sur_site",
    location: DEFAULT_APPOINTMENT_ADDRESS,
    notes: "",
  };
}

function fromAppointment(a: AppointmentView): FormValues {
  const minutes = durationMinutes(a.startsAt, a.endsAt);
  return {
    date: utcToLocalDate(a.startsAt),
    startTime: utcToLocalTime(a.startsAt),
    duration: String(minutes > 0 ? minutes : DEFAULT_APPOINTMENT_MINUTES),
    kind: (APPOINTMENT_KINDS.some((k) => k.code === a.kind) ? a.kind : "entretien") as AppointmentKind,
    mode: (APPOINTMENT_MODES.some((m) => m.code === a.mode) ? a.mode : "sur_site") as AppointmentMode,
    location: a.location ?? (a.mode === "sur_site" ? DEFAULT_APPOINTMENT_ADDRESS : ""),
    notes: a.notes ?? "",
  };
}

// « RDV » : poser un rendez-vous d'admission individuel (entretien, test oral…). S'il en
// existe déjà un de prévu, le dialogue l'ouvre pour le déplacer ou l'annuler, et propose
// d'en poser un autre. Le RDV part dans l'agenda Google « Admissions PEF — Rendez-vous ».
export function AppointmentDialog({
  learnerId,
  learnerName,
  appointment = null,
  triggerLabel,
  defaultKind = "entretien",
}: {
  learnerId: string;
  learnerName: string;
  appointment?: AppointmentView | null;
  triggerLabel?: string;
  // Type proposé pour un nouveau RDV (ex. diagnostic ToFrance pour un apprenant inscrit)
  defaultKind?: AppointmentKind;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentView | null>(appointment);
  const [values, setValues] = useState<FormValues>(appointment ? fromAppointment(appointment) : blank(defaultKind));
  const [pending, startTransition] = useTransition();
  // Créneaux libres (null = en cours de chargement), créneau choisi, saisie libre ouverte.
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<FreeSlot | null>(null);
  const [showOther, setShowOther] = useState(Boolean(appointment));
  const router = useRouter();

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => setValues((s) => ({ ...s, [key]: v }));

  // Date, heure ou durée changées à la main : ce n'est plus le créneau proposé.
  const setWhen = (key: "date" | "startTime" | "duration", v: string) => {
    setChosen(null);
    set(key, v);
  };

  async function loadSlots(excludeAppointmentId: string | null) {
    setSlots(null);
    setSlotsError(null);
    const result = await listAdmissionFreeSlots({ excludeAppointmentId });
    if (result.ok) setSlots(result.slots);
    else {
      setSlots([]);
      setSlotsError(result.error);
    }
  }

  function onOpenChange(next: boolean) {
    if (next) {
      // Toujours repartir de l'état réel (RDV prévu ou formulaire vierge).
      setEditing(appointment);
      setValues(appointment ? fromAppointment(appointment) : blank(defaultKind));
      setChosen(null);
      setShowOther(Boolean(appointment));
      void loadSlots(appointment?.id ?? null);
    }
    setOpen(next);
  }

  function pickSlot(slot: FreeSlot) {
    setChosen(slot);
    setValues((s) => ({ ...s, date: slot.date, startTime: slot.time, duration: String(slot.minutes) }));
  }

  function changeMode(mode: AppointmentMode) {
    setValues((s) => {
      let location = s.location;
      if (mode === "sur_site" && !location.trim()) location = DEFAULT_APPOINTMENT_ADDRESS;
      if (mode !== "sur_site" && location === DEFAULT_APPOINTMENT_ADDRESS) location = "";
      return { ...s, mode, location };
    });
  }

  function startAnother() {
    setEditing(null);
    setValues(blank(defaultKind));
    setChosen(null);
    setShowOther(false);
    void loadSlots(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await upsertAdmissionAppointment({
        id: editing?.id,
        learnerId,
        date: values.date,
        startTime: values.startTime,
        durationMinutes: Number(values.duration),
        kind: values.kind,
        mode: values.mode,
        location: values.location.trim() || null,
        notes: values.notes.trim() || null,
        fromSlot: Boolean(chosen),
      });
      if (!result.ok) {
        toast.error(result.error);
        // Créneau pris entre-temps : on rafraîchit la liste proposée.
        if (chosen) {
          setChosen(null);
          void loadSlots(editing?.id ?? null);
        }
        return;
      }
      toast.success(editing ? "Rendez-vous mis à jour — Google Agenda suit." : "Rendez-vous posé — il arrive dans Google Agenda.");
      setOpen(false);
      router.refresh();
    });
  }

  function cancelAppointment() {
    if (!editing) return;
    if (!window.confirm(`Annuler le rendez-vous du ${dayLabel(editing.startsAt)} à ${timeOf(editing.startsAt)} ?`)) return;
    startTransition(async () => {
      const result = await setAdmissionAppointmentStatus({ id: editing.id, status: "annule" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Rendez-vous annulé — retiré de Google Agenda.");
      setOpen(false);
      router.refresh();
    });
  }

  const title = appointment
    ? `RDV prévu le ${dayLabel(appointment.startsAt)} à ${timeOf(appointment.startsAt)} — déplacer ou annuler`
    : "Poser un rendez-vous";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {triggerLabel ? (
          <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
            <CalendarClock className="mr-1 h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            title={title}
            aria-label={title}
            className={appointment ? "h-7 border-violet-300 bg-violet-50 px-2 text-xs text-violet-800" : "h-7 px-2 text-xs"}
          >
            <CalendarPlus className="mr-1 h-3.5 w-3.5" />
            RDV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Déplacer le rendez-vous" : "Rendez-vous d'admission"} — {learnerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {appointment && editing && (
            <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              Prévu le <b>{dayLabel(appointment.startsAt)} à {timeOf(appointment.startsAt)}</b> ({appointmentModeLabel(appointment.mode).toLowerCase()}).
              Changez la date ou l&apos;heure pour le déplacer.
              <button type="button" onClick={startAnother} className="mt-1 block text-xs underline">
                Poser un autre rendez-vous en plus
              </button>
            </div>
          )}
          <SlotPicker
            slots={slots}
            error={slotsError}
            chosen={chosen}
            onPick={pickSlot}
          />
          {showOther ? (
            <div className="space-y-2">
              {!editing && (
                <p className="text-xs font-medium text-muted-foreground">Autre horaire (hors créneaux)</p>
              )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 space-y-2 sm:col-span-1">
                <Label>Date</Label>
                <Input type="date" value={values.date} onChange={(e) => setWhen("date", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Heure</Label>
                <Input type="time" value={values.startTime} onChange={(e) => setWhen("startTime", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Durée</Label>
                <Select value={values.duration} onValueChange={(v) => setWhen("duration", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([...APPOINTMENT_DURATIONS.map(String), values.duration])].map((m) => (
                      <SelectItem key={m} value={m}>{m} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setShowOther(true);
              }}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Autre horaire
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={values.kind} onValueChange={(v) => set("kind", v as AppointmentKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_KINDS.map((k) => (
                    <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={values.mode} onValueChange={(v) => changeMode(v as AppointmentMode)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_MODES.map((m) => (
                    <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Lieu {values.mode !== "sur_site" && "(optionnel)"}</Label>
            <Input
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder={values.mode === "visio" ? "Lien de la visio, ou « appel vidéo WhatsApp »" : values.mode === "telephone" ? "Nous appelons la personne" : DEFAULT_APPOINTMENT_ADDRESS}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optionnel)</Label>
            <Textarea
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Venir avec une pièce d'identité ; vient avec sa fille qui traduit…"
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            {editing ? (
              <Button variant="ghost" size="sm" onClick={cancelAppointment} disabled={pending} className="text-destructive">
                <X className="mr-1 h-3.5 w-3.5" />
                Annuler le RDV
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Fermer</Button>
              <Button onClick={submit} disabled={pending || !values.date || !values.startTime || (!chosen && !showOther)}>
                {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Poser le RDV"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Prochains créneaux libres, groupés par jour : un toucher remplit date, heure et durée.
function SlotPicker({
  slots,
  error,
  chosen,
  onPick,
}: {
  slots: FreeSlot[] | null;
  error: string | null;
  chosen: FreeSlot | null;
  onPick: (slot: FreeSlot) => void;
}) {
  if (slots === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Recherche des créneaux libres…
      </p>
    );
  }
  if (error) return <p className="text-sm text-muted-foreground">Créneaux indisponibles ({error}) : utilisez « Autre horaire ».</p>;
  if (!slots.length) {
    return <p className="text-sm text-muted-foreground">Aucun créneau libre dans les 14 prochains jours : utilisez « Autre horaire ».</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Créneaux libres</p>
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {groupSlotsByDay(slots).map((day) => (
          <div key={day.date}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{day.label}</p>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => {
                const selected = chosen?.startsAt === slot.startsAt;
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => onPick(slot)}
                    aria-pressed={selected}
                    aria-label={slotLabel(slot)}
                    className={cn(
                      "min-h-10 min-w-16 rounded-md border px-3 text-sm tabular-nums transition-colors",
                      selected
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-input bg-background hover:border-violet-300 hover:bg-violet-50",
                    )}
                  >
                    {slot.time.replace(":", "h")}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {chosen && (
        <p className="text-sm text-violet-900">
          Créneau choisi : <b>{slotLabel(chosen)}</b> ({chosen.minutes} min)
        </p>
      )}
    </div>
  );
}

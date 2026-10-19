"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, X } from "lucide-react";
import { setAdmissionAppointmentStatus, upsertAdmissionAppointment } from "@/app/(app)/apprenants/admission/actions";
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
import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
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

function blank(): FormValues {
  return {
    date: todayInParis(),
    startTime: "10:00",
    duration: String(DEFAULT_APPOINTMENT_MINUTES),
    kind: "entretien",
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
}: {
  learnerId: string;
  learnerName: string;
  appointment?: AppointmentView | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentView | null>(appointment);
  const [values, setValues] = useState<FormValues>(appointment ? fromAppointment(appointment) : blank());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) => setValues((s) => ({ ...s, [key]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      // Toujours repartir de l'état réel (RDV prévu ou formulaire vierge).
      setEditing(appointment);
      setValues(appointment ? fromAppointment(appointment) : blank());
    }
    setOpen(next);
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
    setValues(blank());
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
      });
      if (!result.ok) {
        toast.error(result.error);
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
    : "Poser un rendez-vous d'admission";

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 space-y-2 sm:col-span-1">
              <Label>Date</Label>
              <Input type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Heure</Label>
              <Input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Durée</Label>
              <Select value={values.duration} onValueChange={(v) => set("duration", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...new Set([...APPOINTMENT_DURATIONS.map(String), values.duration])].map((m) => (
                    <SelectItem key={m} value={m}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
              <Button onClick={submit} disabled={pending || !values.date || !values.startTime}>
                {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Poser le RDV"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

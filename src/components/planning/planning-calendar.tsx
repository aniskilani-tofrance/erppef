"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import listPlugin from "@fullcalendar/list";
import frLocale from "@fullcalendar/core/locales/fr";
import type { DateSelectArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { toast } from "sonner";
import {
  fetchSessions,
  moveSession,
  type CalendarSession,
} from "@/app/(app)/planning/actions";
import { nextDay } from "@/lib/dates";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SessionSheet } from "./session-sheet";
import { SessionCreateDialog, type GroupOption } from "./session-create-dialog";

type Filters = { trainerId: string; roomId: string; funderId: string };
type Option = { id: string; name: string };
type ColoredOption = { id: string; name: string; color: string | null };
type FunderOption = { id: string; name: string; color: string };
type ColorBy = "formateur" | "financeur" | "salle";

// Palette de secours (formateur ou salle sans couleur) : stable par position dans la liste.
const FALLBACK_COLORS = ["#0ea5e9", "#14b8a6", "#a855f7", "#f59e0b", "#ef4444", "#22c55e", "#6366f1", "#ec4899", "#84cc16", "#f97316"];
const COLOR_BY_OPTIONS: { value: ColorBy; label: string }[] = [
  { value: "formateur", label: "Couleurs : formateurs" },
  { value: "financeur", label: "Couleurs : financeurs" },
  { value: "salle", label: "Couleurs : salles" },
];
type ClosureBand = { id: string; label: string; startsOn: string; endsOn: string };
type AbsenceBand = {
  id: string;
  trainerId: string;
  trainerName: string;
  startsOn: string;
  endsOn: string;
  kind: string;
};

// Libellé + couleur du bandeau d'absence. Le motif médical n'est volontairement
// pas affiché sur le planning (visible par tous les rôles) — il reste sur la fiche.
const ABSENCE_STYLES: Record<string, { label: string; color: string }> = {
  formation: { label: "en formation", color: "#7c3aed" },
  conge: { label: "en congé", color: "#d97706" },
  maladie: { label: "absent·e", color: "#64748b" },
  autre: { label: "absent·e", color: "#64748b" },
};

// Référence STABLE : un tableau littéral dans le JSX est recréé à chaque rendu, FullCalendar y voit
// un changement d'options et se remet à jour sans fin (erreur React #185). Dimanche masqué.
const HIDDEN_DAYS: number[] = [0];

export function PlanningCalendar({
  canEdit,
  trainers,
  rooms,
  funders,
  closures = [],
  absences = [],
  groups = [],
}: {
  canEdit: boolean;
  trainers: ColoredOption[];
  rooms: ColoredOption[];
  funders: FunderOption[];
  closures?: ClosureBand[];
  absences?: AbsenceBand[];
  groups?: GroupOption[];
}) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [filters, setFilters] = useState<Filters>({ trainerId: "all", roomId: "all", funderId: "all" });
  // Une couleur par FORMATEUR par défaut : c'est ce qu'on lit d'un coup d'œil (qui est où).
  const [colorBy, setColorBy] = useState<ColorBy>("formateur");
  const trainerColor = useMemo(
    () => new Map(trainers.map((t, i) => [t.id, t.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]])),
    [trainers],
  );
  const roomColor = useMemo(
    () => new Map(rooms.map((r, i) => [r.id, r.color ?? FALLBACK_COLORS[(i + 3) % FALLBACK_COLORS.length]])),
    [rooms],
  );
  const colorOf = (s: CalendarSession): string => {
    if (colorBy === "financeur") return s.funderColor;
    if (colorBy === "salle") return (s.roomId && roomColor.get(s.roomId)) || "#64748b";
    return (s.trainerId && (trainerColor.get(s.trainerId) ?? s.trainerColor)) || "#64748b";
  };
  const legend: { id: string; name: string; color: string }[] =
    colorBy === "financeur"
      ? funders.map((f) => ({ id: f.id, name: f.name, color: f.color }))
      : colorBy === "salle"
        ? rooms.map((r) => ({ id: r.id, name: r.name, color: roomColor.get(r.id)! }))
        : trainers.map((t) => ({ id: t.id, name: t.name, color: trainerColor.get(t.id)! }));
  const [selected, setSelected] = useState<CalendarSession | null>(null);
  const [newSlot, setNewSlot] = useState<{ startsAt: string; endsAt: string } | null>(null);
  // Sur mobile, la grille horaire est illisible : vue agenda (liste) par défaut.
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", range],
    queryFn: () => fetchSessions(range!),
    enabled: range !== null,
  });

  // Le drag & drop est optimiste : l'événement bouge immédiatement ;
  // si Postgres rejette (contrainte d'exclusion), refetch = rollback visuel + toast.
  const move = useMutation({
    mutationFn: moveSession,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
      }
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Erreur réseau : déplacement annulé.");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        if (filters.trainerId !== "all" && s.trainerId !== filters.trainerId) return false;
        if (filters.roomId !== "all" && s.roomId !== filters.roomId) return false;
        if (filters.funderId !== "all") {
          const funder = funders.find((f) => f.id === filters.funderId);
          if (funder && s.funderColor !== funder.color) return false;
        }
        return true;
      }),
    [sessions, filters, funders],
  );

  const events = [
    ...filtered.map((s) => ({
      id: s.id,
      title: s.groupName,
      start: s.startsAt,
      end: s.endsAt,
      backgroundColor: colorOf(s),
      borderColor: "rgba(0,0,0,.18)",
      textColor: "#ffffff",
      editable: canEdit && s.status === "planifiee",
      extendedProps: { room: s.roomName, trainer: s.trainerName, colorBy },
    })),
    // Vacances, fériés et fermetures en fond grisé (ends_on inclusif → end exclusif).
    ...closures.map((c) => ({
      id: `closure-${c.id}`,
      title: c.label,
      start: c.startsOn,
      end: nextDay(c.endsOn),
      allDay: true,
      display: "background" as const,
      backgroundColor: "#94a3b8",
      editable: false,
    })),
    // Absences formateurs en bandeau « journée » (mêmes plages inclusives que la fiche).
    ...absences
      .filter((a) => filters.trainerId === "all" || a.trainerId === filters.trainerId)
      .map((a) => {
        const style = ABSENCE_STYLES[a.kind] ?? ABSENCE_STYLES.autre;
        return {
          id: `absence-${a.id}`,
          title: `${a.trainerName} — ${style.label}`,
          start: a.startsOn,
          end: nextDay(a.endsOn),
          allDay: true,
          backgroundColor: style.color,
          borderColor: "rgba(0,0,0,.15)",
          textColor: "#ffffff",
          editable: false,
          extendedProps: { absence: true },
        };
      }),
  ];

  function handleMove(arg: EventDropArg | EventResizeDoneArg) {
    if (!arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    move.mutate({
      sessionId: arg.event.id,
      startsAt: arg.event.start.toISOString(),
      endsAt: arg.event.end.toISOString(),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          placeholder="Tous les formateurs"
          value={filters.trainerId}
          options={trainers}
          onChange={(v) => setFilters((f) => ({ ...f, trainerId: v }))}
        />
        <FilterSelect
          placeholder="Toutes les salles"
          value={filters.roomId}
          options={rooms}
          onChange={(v) => setFilters((f) => ({ ...f, roomId: v }))}
        />
        <FilterSelect
          placeholder="Tous les financeurs"
          value={filters.funderId}
          options={funders}
          onChange={(v) => setFilters((f) => ({ ...f, funderId: v }))}
        />
        <Select value={colorBy} onValueChange={(v) => setColorBy(v as ColorBy)}>
          <SelectTrigger className="h-9 w-[190px] text-sm" title="Ce que les couleurs représentent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLOR_BY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {legend.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-background p-3 [&_.fc]:text-sm [&_.fc-timegrid-event]:rounded-md [&_.fc-timegrid-event]:shadow-sm [&_.fc-daygrid-event]:rounded [&_.fc-col-header-cell-cushion]:py-1.5 [&_.fc-col-header-cell-cushion]:font-semibold [&_.fc-timegrid-slot]:h-8 [&_.fc-day-today]:bg-amber-50/60">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin, listPlugin]}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: isMobile
              ? "listWeek,dayGridMonth"
              : "timeGridWeek,dayGridMonth,multiMonthYear",
          }}
          locale={frLocale}
          timeZone="Europe/Paris"
          slotMinTime="08:00:00"
          slotMaxTime="21:30:00"
          scrollTime="08:30:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00"
          slotEventOverlap={false}
          allDaySlot
          allDayText="Absences"
          expandRows
          dayMaxEventRows={3}
          stickyHeaderDates
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          weekends
          hiddenDays={HIDDEN_DAYS}
          height="auto"
          nowIndicator
          events={events}
          eventContent={(arg) => {
            // Fond grisé (vacances/fériés) : rendu par défaut
            if (arg.event.display === "background") return undefined;
            if (arg.event.extendedProps.absence) {
              return (
                <span className="block truncate px-1 text-[10px] font-medium leading-4">
                  {arg.event.title}
                </span>
              );
            }
            const { room, trainer, colorBy: mode } = arg.event.extendedProps as { room?: string; trainer?: string; colorBy?: ColorBy };
            // En mode formateur la couleur dit déjà qui : on met la salle en avant, et inversement.
            const details = (mode === "salle" ? [trainer, room] : [room, trainer]).filter(Boolean).join(" · ");
            if (arg.view.type.startsWith("list")) {
              return (
                <span>
                  <b>{arg.event.title}</b>
                  {details && <span className="ml-2 opacity-75">{details}</span>}
                </span>
              );
            }
            return (
              <div className="flex h-full flex-col overflow-hidden px-1 py-0.5 leading-tight">
                <div className="truncate text-[11px] font-semibold">{arg.event.title}</div>
                {details && <div className="truncate text-[10px] opacity-85">{details}</div>}
                {arg.timeText && <div className="mt-auto truncate text-[9px] opacity-70">{arg.timeText}</div>}
              </div>
            );
          }}
          editable={canEdit}
          selectable={canEdit}
          select={(arg: DateSelectArg) => {
            if (arg.view.type !== "timeGridWeek" || arg.allDay) return;
            setNewSlot({ startsAt: arg.start.toISOString(), endsAt: arg.end.toISOString() });
          }}
          eventDrop={handleMove}
          eventResize={handleMove}
          datesSet={(arg) =>
            setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })
          }
          eventClick={(arg) => {
            const session = sessions.find((s) => s.id === arg.event.id);
            if (session) setSelected(session);
          }}
        />
      </div>

      <SessionCreateDialog
        slot={newSlot}
        groups={groups}
        trainers={trainers}
        rooms={rooms}
        onClose={() => setNewSlot(null)}
        onCreated={() => {
          setNewSlot(null);
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
        }}
      />

      <SessionSheet
        session={selected}
        canEdit={canEdit}
        trainers={trainers}
        rooms={rooms}
        onClose={() => setSelected(null)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          setSelected(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
type FunderOption = { id: string; name: string; color: string };
type ClosureBand = { id: string; label: string; startsOn: string; endsOn: string };

export function PlanningCalendar({
  canEdit,
  trainers,
  rooms,
  funders,
  closures = [],
  groups = [],
}: {
  canEdit: boolean;
  trainers: Option[];
  rooms: Option[];
  funders: FunderOption[];
  closures?: ClosureBand[];
  groups?: GroupOption[];
}) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [filters, setFilters] = useState<Filters>({ trainerId: "all", roomId: "all", funderId: "all" });
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
      title: `${s.groupName}${s.roomName ? ` · ${s.roomName}` : ""}${s.trainerName ? ` · ${s.trainerName}` : ""}`,
      start: s.startsAt,
      end: s.endsAt,
      backgroundColor: s.funderColor,
      borderColor: s.funderColor,
      editable: canEdit && s.status === "planifiee",
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
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {funders.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
              {f.name}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-background p-3 [&_.fc]:text-sm">
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
          slotMinTime="09:00:00"
          slotMaxTime="20:00:00"
          weekends={false}
          height="auto"
          nowIndicator
          events={events}
          editable={canEdit}
          selectable={canEdit}
          select={(arg: DateSelectArg) => {
            if (arg.view.type !== "timeGridWeek") return;
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

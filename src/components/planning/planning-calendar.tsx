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
// Texte sombre sur une couleur claire (jaune, lime…), blanc sur une couleur foncée : lisible partout.
export function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#0f172a" : "#ffffff";
}

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
    ...filtered.map((s) => {
      const bg = colorOf(s);
      return {
        id: s.id,
        title: s.groupName,
        start: s.startsAt,
        end: s.endsAt,
        backgroundColor: bg,
        borderColor: "rgba(0,0,0,.18)",
        textColor: readableText(bg),
        editable: canEdit && s.status === "planifiee",
        extendedProps: { room: s.roomName, trainer: s.trainerName, colorBy },
      };
    }),
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
      {/* Téléphone : filtres sur deux colonnes (au lieu de quatre lignes) ; bureau : en ligne. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
          <SelectTrigger className="h-9 w-full text-sm sm:w-[190px]" title="Ce que les couleurs représentent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLOR_BY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:ml-auto">
          {legend.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>

      {/* Lisibilité : textes du calendrier remontés (titres, boutons, heures, liste mobile), barre
          d'outils qui se replie sur téléphone, créneaux un peu plus hauts pour 3 lignes par séance. */}
      <div className="rounded-lg border bg-background p-2 sm:p-3 [&_.fc]:text-sm [&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-y-2 [&_.fc-toolbar-title]:text-base! sm:[&_.fc-toolbar-title]:text-lg! [&_.fc-button]:px-2! [&_.fc-button]:text-xs! sm:[&_.fc-button]:text-sm! [&_.fc-timegrid-event]:rounded-md [&_.fc-timegrid-event]:shadow-sm [&_.fc-daygrid-event]:rounded [&_.fc-col-header-cell-cushion]:py-1.5 [&_.fc-col-header-cell-cushion]:font-semibold [&_.fc-timegrid-slot]:h-9 [&_.fc-timegrid-slot-label-cushion]:text-xs [&_.fc-timegrid-axis-cushion]:text-xs [&_.fc-day-today]:bg-amber-50/60 [&_.fc-list-day-cushion]:bg-muted! [&_.fc-list-day-text]:text-sm [&_.fc-list-day-side-text]:text-sm [&_.fc-list-event-time]:text-sm [&_.fc-list-event-time]:whitespace-nowrap [&_.fc-list-event-title]:text-sm [&_.fc-list-event-title]:leading-snug [&_.fc-list-event-graphic]:hidden">
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
          // Fuseau du navigateur (Paris pour l'équipe). Un fuseau NOMMÉ sans plugin de fuseau fait
          // retomber FullCalendar en « UTC-coercion » : toutes les heures s'affichaient décalées de 1 à 2 h.
          timeZone="local"
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
                <span className="block truncate px-1.5 text-[11px] font-medium leading-5">
                  {arg.event.title}
                </span>
              );
            }
            const { room, trainer, colorBy: mode } = arg.event.extendedProps as { room?: string; trainer?: string; colorBy?: ColorBy };
            // En mode formateur la couleur dit déjà qui : on met la salle en avant, et inversement.
            const details = (mode === "salle" ? [trainer, room] : [room, trainer]).filter(Boolean).join(" · ");
            if (arg.view.type.startsWith("list")) {
              // Liste (téléphone) : pastille de la couleur du formateur (la pastille native de
              // FullCalendar reprend la bordure, grise), titre sur une ligne, salle et formatrice dessous.
              return (
                <span className="flex items-start gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: arg.event.backgroundColor }} />
                  <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                    <b className="text-sm">{arg.event.title}</b>
                    {details && <span className="text-xs text-muted-foreground sm:text-sm">{details}</span>}
                  </span>
                </span>
              );
            }
            if (arg.view.type === "dayGridMonth") {
              return (
                <div className="truncate px-1 text-[11px] font-medium leading-5">
                  {arg.timeText && <span className="mr-1 opacity-90">{arg.timeText}</span>}
                  {arg.event.title}
                </div>
              );
            }
            // Grille : le titre peut passer sur 2-3 lignes (les cases ont de la hauteur, les colonnes
            // sont étroites quand plusieurs séances se chevauchent) ; l'heure reste en bas.
            return (
              <div className="flex h-full flex-col overflow-hidden px-1.5 py-1 leading-tight">
                <div className="line-clamp-3 text-xs font-semibold">{arg.event.title}</div>
                {details && <div className="line-clamp-2 text-[11px]">{details}</div>}
                {arg.timeText && <div className="mt-auto truncate text-[10.5px] opacity-90">{arg.timeText}</div>}
              </div>
            );
          }}
          // Infobulle complète au survol (titre, salle, formatrice, horaire) : utile quand la case est étroite.
          eventDidMount={(arg) => {
            if (arg.event.display === "background") return;
            const { room, trainer } = arg.event.extendedProps as { room?: string; trainer?: string };
            arg.el.title = [arg.event.title, [room, trainer].filter(Boolean).join(" · "), arg.timeText].filter(Boolean).join("\n");
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
      <SelectTrigger className="w-full sm:w-44">
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

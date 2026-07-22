import { createAdminClient } from "@/lib/supabase/admin";
import type { Closure, EngineData, RoomData, TrainerData } from "./types";

// Charge tout ce dont le moteur a besoin en un seul aller-retour logique.
// Client service_role (le moteur doit voir les coûts et TOUTES les séances),
// appelé uniquement depuis des Server Actions déjà protégées par requireRole().
export async function loadEngineData(orgId: string, fromDate: string): Promise<EngineData> {
  const supabase = createAdminClient();

  const [org, trainers, availabilities, absences, rooms, roomUnavail, sessions, groups, closures] =
    await Promise.all([
      supabase.from("organizations").select("timezone, school_holiday_zone").eq("id", orgId).single(),
      supabase.from("trainers").select("*").eq("org_id", orgId),
      supabase.from("trainer_availabilities").select("*").eq("org_id", orgId),
      supabase.from("trainer_absences").select("*").eq("org_id", orgId).gte("ends_on", fromDate),
      supabase.from("rooms").select("*").eq("org_id", orgId),
      supabase.from("room_unavailabilities").select("*").eq("org_id", orgId).gte("ends_on", fromDate),
      supabase
        .from("sessions")
        .select("trainer_id, room_id, group_id, starts_at, ends_at")
        .eq("org_id", orgId)
        .neq("status", "annulee")
        .gte("starts_at", `${fromDate}T00:00:00Z`),
      supabase
        .from("groups")
        .select("trainer_id, programs(level)")
        .eq("org_id", orgId)
        .in("status", ["en_attente", "ouvert", "complet"]),
      supabase.from("calendar_closures").select("*").gte("ends_on", fromDate),
    ]);

  const firstError =
    org.error ?? trainers.error ?? availabilities.error ?? absences.error ?? rooms.error ??
    roomUnavail.error ?? sessions.error ?? groups.error ?? closures.error;
  if (firstError) throw new Error(`Chargement des données moteur : ${firstError.message}`);
  if (!org.data) throw new Error("Organisation introuvable");

  const zone = org.data.school_holiday_zone;

  const trainerBusy = new Map<string, { startsAt: string; endsAt: string }[]>();
  const roomBusy = new Map<string, { startsAt: string; endsAt: string }[]>();
  for (const s of sessions.data ?? []) {
    if (s.trainer_id) {
      (trainerBusy.get(s.trainer_id) ?? trainerBusy.set(s.trainer_id, []).get(s.trainer_id)!)
        .push({ startsAt: s.starts_at, endsAt: s.ends_at });
    }
    if (s.room_id) {
      (roomBusy.get(s.room_id) ?? roomBusy.set(s.room_id, []).get(s.room_id)!)
        .push({ startsAt: s.starts_at, endsAt: s.ends_at });
    }
  }

  const levelsByTrainer = new Map<string, string[]>();
  for (const g of groups.data ?? []) {
    const level = (g.programs as unknown as { level: string | null } | null)?.level;
    if (g.trainer_id && level) {
      const list = levelsByTrainer.get(g.trainer_id) ?? [];
      if (!list.includes(level)) list.push(level);
      levelsByTrainer.set(g.trainer_id, list);
    }
  }

  const engineTrainers: TrainerData[] = (trainers.data ?? []).map((t) => ({
    id: t.id,
    firstName: t.first_name,
    lastName: t.last_name,
    contractType: t.contract_type,
    hourlyCost: Number(t.hourly_cost),
    weeklyHoursMax: Number(t.weekly_hours_max),
    priority: t.priority,
    skills: t.skills ?? [],
    isActive: t.is_active,
    availabilities: (availabilities.data ?? [])
      .filter((a) => a.trainer_id === t.id)
      .map((a) => ({
        weekday: a.weekday,
        start: a.start_time.slice(0, 5),
        end: a.end_time.slice(0, 5),
      })),
    absences: (absences.data ?? [])
      .filter((a) => a.trainer_id === t.id)
      .map((a) => ({ startsOn: a.starts_on, endsOn: a.ends_on })),
    busy: trainerBusy.get(t.id) ?? [],
    currentGroupLevels: levelsByTrainer.get(t.id) ?? [],
  }));

  const engineRooms: RoomData[] = (rooms.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    isActive: r.is_active,
    unavailabilities: (roomUnavail.data ?? [])
      .filter((u) => u.room_id === r.id)
      .map((u) => ({ startsOn: u.starts_on, endsOn: u.ends_on })),
    busy: roomBusy.get(r.id) ?? [],
  }));

  // Fermetures applicables : globales (fériés + vacances de NOTRE zone) + celles de l'org.
  const engineClosures: Closure[] = (closures.data ?? [])
    .filter((c) => {
      if (c.org_id && c.org_id !== orgId) return false;
      if (c.kind === "vacances_scolaires" && c.zone && c.zone !== zone) return false;
      return true;
    })
    .map((c) => ({ startsOn: c.starts_on, endsOn: c.ends_on, label: c.label, kind: c.kind }));

  return {
    trainers: engineTrainers,
    rooms: engineRooms,
    closures: engineClosures,
    timezone: org.data.timezone,
  };
}

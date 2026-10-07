import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInRange, utcToLocalDate } from "@/lib/dates";

// Séances à venir qui ont besoin d'une remplaçante : la formatrice prévue est absente
// (congé validé, ou demande encore « à valider »), ou la séance n'a pas de formateur.
// Lecture via le client de la personne connectée (RLS = son organisation).

export const REPLACEMENT_HORIZON_DAYS = 21;

export type SessionToReplace = {
  id: string;
  groupId: string;
  groupName: string;
  level: string | null;
  startsAt: string;
  endsAt: string;
  roomName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  reason: "absence" | "absence_a_valider" | "sans_formateur";
};

type AbsenceRow = { trainer_id: string; starts_on: string; ends_on: string; status: string };

// Décision PURE (testée) : pourquoi cette séance est à remplacer, ou null.
export function replacementReason(
  session: { trainerId: string | null; startsAt: string },
  absences: AbsenceRow[],
): SessionToReplace["reason"] | null {
  if (!session.trainerId) return "sans_formateur";
  const day = utcToLocalDate(session.startsAt);
  const covering = absences.filter((a) => a.trainer_id === session.trainerId && dateInRange(day, a.starts_on, a.ends_on));
  if (covering.some((a) => a.status === "approuvee")) return "absence";
  if (covering.some((a) => a.status === "en_attente")) return "absence_a_valider";
  return null;
}

export async function loadSessionsToReplace(
  supabase: SupabaseClient,
  horizonDays = REPLACEMENT_HORIZON_DAYS,
): Promise<SessionToReplace[]> {
  const now = new Date();
  const until = new Date(now.getTime() + horizonDays * 86_400_000).toISOString();
  const today = utcToLocalDate(now.toISOString());

  const [{ data: sessions }, { data: absences }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, group_id, starts_at, ends_at, trainer_id, groups(name, programs(level)), rooms:room_id(name), trainers:trainer_id(first_name, last_name)")
      .eq("status", "planifiee")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", until)
      .order("starts_at")
      .limit(500),
    supabase
      .from("trainer_absences")
      .select("trainer_id, starts_on, ends_on, status")
      .in("status", ["approuvee", "en_attente"])
      .gte("ends_on", today),
  ]);

  const result: SessionToReplace[] = [];
  for (const s of sessions ?? []) {
    const reason = replacementReason({ trainerId: s.trainer_id, startsAt: s.starts_at }, (absences ?? []) as AbsenceRow[]);
    if (!reason) continue;
    const g = s.groups as unknown as { name: string; programs: { level: string | null } | null } | null;
    const t = s.trainers as unknown as { first_name: string; last_name: string | null } | null;
    result.push({
      id: s.id,
      groupId: s.group_id,
      groupName: g?.name ?? "Groupe",
      level: g?.programs?.level ?? null,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      roomName: (s.rooms as unknown as { name: string } | null)?.name ?? null,
      trainerId: s.trainer_id,
      trainerName: t ? `${t.first_name} ${t.last_name ?? ""}`.trim() : null,
      reason,
    });
  }
  return result;
}

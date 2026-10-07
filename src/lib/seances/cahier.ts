import type { SupabaseClient } from "@supabase/supabase-js";

// Lecture du cahier de séance (colonnes log_* de `sessions`, migration 0039).
// Tolérant : tant que la migration n'est pas appliquée, les lectures renvoient
// `available: false` au lieu de casser la page qui les affiche.

export type SessionLog = {
  sessionId: string;
  startsAt: string;
  done: string | null;
  next: string | null;
  updatedAt: string | null;
};

type Row = { id: string; starts_at: string; log_done: string | null; log_next: string | null; log_updated_at: string | null };

const toLog = (r: Row): SessionLog => ({
  sessionId: r.id,
  startsAt: r.starts_at,
  done: r.log_done,
  next: r.log_next,
  updatedAt: r.log_updated_at,
});

// Le cahier de cette séance + celui de la dernière séance du groupe qui en a un
// (« la dernière fois ») — ce que lit une remplaçante ou une co-animatrice en arrivant.
export async function loadSessionLogContext(
  supabase: SupabaseClient,
  session: { id: string; groupId: string; startsAt: string },
): Promise<{ available: boolean; current: SessionLog | null; previous: SessionLog | null }> {
  const [current, previous] = await Promise.all([
    supabase.from("sessions").select("id, starts_at, log_done, log_next, log_updated_at").eq("id", session.id).maybeSingle(),
    supabase
      .from("sessions")
      .select("id, starts_at, log_done, log_next, log_updated_at")
      .eq("group_id", session.groupId)
      .lt("starts_at", session.startsAt)
      .not("log_updated_at", "is", null)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (current.error || previous.error) return { available: false, current: null, previous: null };
  return {
    available: true,
    current: current.data ? toLog(current.data as Row) : null,
    previous: previous.data ? toLog(previous.data as Row) : null,
  };
}

// Dernier cahier rempli par groupe, pour un lot de groupes (tableau de bord « Ma journée »).
export async function loadLatestLogsByGroup(
  supabase: SupabaseClient,
  groupIds: string[],
  beforeIso: string,
): Promise<Map<string, SessionLog>> {
  const latest = new Map<string, SessionLog>();
  if (!groupIds.length) return latest;
  const { data, error } = await supabase
    .from("sessions")
    .select("id, group_id, starts_at, log_done, log_next, log_updated_at")
    .in("group_id", groupIds)
    .lt("starts_at", beforeIso)
    .not("log_updated_at", "is", null)
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error) return latest;
  for (const r of (data ?? []) as (Row & { group_id: string })[]) {
    if (!latest.has(r.group_id)) latest.set(r.group_id, toLog(r));
  }
  return latest;
}

export function formatLogDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });
}

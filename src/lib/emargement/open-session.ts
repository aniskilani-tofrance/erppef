import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Séance ouverte à l'émargement pour ce jeton, dans la fenêtre de validité (jusqu'à 24 h après
// la fin : couvre les retards sans laisser traîner le lien). Le jeton est le secret des pages
// publiques qui circulent en classe : la feuille d'émargement et la signature des documents.

export const ATTENDANCE_LINK_GRACE_MS = 24 * 3600 * 1000;

export type OpenAttendanceSession = {
  id: string;
  org_id: string;
  group_id: string;
  starts_at: string;
  ends_at: string;
  attendance_closed_at: string | null;
  groups: unknown;
};

export async function findOpenAttendanceSession(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<OpenAttendanceSession | null> {
  if (!z.string().uuid().safeParse(token).success) return null;
  const { data: session } = await admin
    .from("sessions")
    .select("id, org_id, group_id, starts_at, ends_at, attendance_closed_at, groups(name)")
    .eq("attendance_token", token)
    .single();
  const s = session as OpenAttendanceSession | null;
  if (!s || s.attendance_closed_at) return null;
  if (now.getTime() > new Date(s.ends_at).getTime() + ATTENDANCE_LINK_GRACE_MS) return null;
  return s;
}

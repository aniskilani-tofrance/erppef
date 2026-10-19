// Chargement des créneaux d'admission libres d'un organisme (serveur uniquement).
// Reçoit le client Supabase et l'organisation de façon explicite : utilisé par l'ERP
// (client de l'utilisateur, sous RLS) et, plus tard, par le formulaire public
// d'inscription (client admin, organisation connue côté serveur). Aucune route publique.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { utcToLocalDate } from "@/lib/dates";
import {
  DEFAULT_SLOT_RULES,
  SLOT_HORIZON_DAYS,
  expandClosedDates,
  freeSlots,
  type BusyRange,
  type FreeSlot,
  type SlotRule,
} from "@/lib/admission/slots";

export type SlotBlockRow = { id: string; startsAt: string; endsAt: string; reason: string | null };

// Plages de l'organisme ; le réglage par défaut tant que rien n'est enregistré.
export async function loadSlotRules(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ rules: SlotRule[]; isDefault: boolean }> {
  const { data, error } = await supabase
    .from("admission_slot_rules")
    .select("weekday, start_time, end_time, slot_minutes, is_active")
    .eq("org_id", orgId)
    .order("weekday")
    .order("start_time");
  if (error) throw new Error(`plages d'admission : ${error.message}`);
  if (!data?.length) return { rules: DEFAULT_SLOT_RULES, isDefault: true };
  return {
    rules: data.map((r) => ({
      weekday: r.weekday as number,
      startTime: String(r.start_time).slice(0, 5),
      endTime: String(r.end_time).slice(0, 5),
      slotMinutes: r.slot_minutes as number,
      isActive: r.is_active as boolean,
    })),
    isDefault: false,
  };
}

// Périodes bloquées qui ne sont pas encore terminées.
export async function loadSlotBlocks(supabase: SupabaseClient, orgId: string, now = new Date()): Promise<SlotBlockRow[]> {
  const { data, error } = await supabase
    .from("admission_slot_blocks")
    .select("id, starts_at, ends_at, reason")
    .eq("org_id", orgId)
    .gt("ends_at", now.toISOString())
    .order("starts_at");
  if (error) throw new Error(`périodes bloquées : ${error.message}`);
  return (data ?? []).map((b) => ({ id: b.id, startsAt: b.starts_at, endsAt: b.ends_at, reason: b.reason }));
}

// Créneaux libres sur l'horizon (14 jours par défaut). excludeAppointmentId : le RDV
// en cours de déplacement ne bloque pas son propre créneau.
export async function loadFreeSlots(
  supabase: SupabaseClient,
  orgId: string,
  { now = new Date(), excludeAppointmentId = null }: { now?: Date; excludeAppointmentId?: string | null } = {},
): Promise<FreeSlot[]> {
  const from = utcToLocalDate(now.toISOString());
  const until = new Date(now.getTime() + (SLOT_HORIZON_DAYS + 1) * 86_400_000);
  const to = utcToLocalDate(until.toISOString());

  const [{ rules }, blocks, appts, closures] = await Promise.all([
    loadSlotRules(supabase, orgId),
    loadSlotBlocks(supabase, orgId, now),
    supabase
      .from("admission_appointments")
      .select("id, starts_at, ends_at, status")
      .eq("org_id", orgId)
      .eq("status", "prevu")
      .lt("starts_at", until.toISOString())
      .gt("ends_at", now.toISOString()),
    // Fériés (entrées globales) et fermetures de l'organisme ; pas les vacances scolaires.
    supabase
      .from("calendar_closures")
      .select("starts_on, ends_on, kind, org_id")
      .in("kind", ["jour_ferie", "fermeture_org"])
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .lte("starts_on", to)
      .gte("ends_on", from),
  ]);
  if (appts.error) throw new Error(`rendez-vous d'admission : ${appts.error.message}`);
  if (closures.error) throw new Error(`fermetures : ${closures.error.message}`);

  const appointments: BusyRange[] = (appts.data ?? [])
    .filter((a) => a.id !== excludeAppointmentId)
    .map((a) => ({ startsAt: a.starts_at, endsAt: a.ends_at, status: a.status }));
  const closedDates = expandClosedDates(
    (closures.data ?? []).map((c) => ({ startsOn: c.starts_on, endsOn: c.ends_on })),
    from,
    to,
  );
  return freeSlots(rules, blocks, appointments, now, { closedDates });
}

// Variante pour un appel hors session (futur formulaire public d'inscription) : client
// admin, organisation passée explicitement par le code serveur, jamais par le visiteur.
export async function loadFreeSlotsForOrg(orgId: string, now = new Date()): Promise<FreeSlot[]> {
  return loadFreeSlots(createAdminClient(), orgId, { now });
}

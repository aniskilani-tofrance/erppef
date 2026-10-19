// Création d'un rendez-vous d'admission (serveur uniquement), commune à l'ERP (dialogue
// « RDV », client de l'utilisateur sous RLS) et au formulaire public d'inscription
// (l'apprenant réserve lui-même son créneau, client admin, organisation fixée par le
// serveur). Même trace partout : ligne au journal des contacts, statut « convoqué »
// (jamais de recul) et événement Google poussé après la réponse (after).
//
// Le verrou contre deux réservations simultanées est en base (0053,
// admission_appointments_no_overlap) : l'erreur Postgres est renvoyée telle quelle,
// à traduire par l'appelant (translatePgError / isAppointmentOverlap).

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextAdmissionStatus, type AdmissionStatus } from "@/lib/admission/status";
import { appointmentJournalNote, channelForMode, type AppointmentKind, type AppointmentMode } from "@/lib/admission/appointments";
import { pushAppointmentToGoogle } from "@/lib/gcal-admissions";

type PgError = { code?: string; message: string };

// Fait avancer le statut d'admission d'apprenants (jamais de recul, « inscrit » définitif).
export async function advanceAdmissionStatus(
  supabase: SupabaseClient,
  learnerIds: string[],
  candidate: AdmissionStatus,
): Promise<void> {
  if (!learnerIds.length) return;
  const { data: rows } = await supabase.from("learners").select("id, admission_status").in("id", learnerIds);
  const byTarget = new Map<AdmissionStatus, string[]>();
  for (const r of rows ?? []) {
    const next = nextAdmissionStatus(r.admission_status, candidate);
    if (next === r.admission_status) continue;
    byTarget.set(next, [...(byTarget.get(next) ?? []), r.id]);
  }
  for (const [status, ids] of byTarget) {
    await supabase.from("learners").update({ admission_status: status }).in("id", ids);
  }
}

// Pousse le RDV vers Google Agenda après la réponse (ne ralentit pas l'écran).
export function pushAppointmentLater(appointmentId: string): void {
  after(() => pushAppointmentToGoogle(appointmentId).catch(() => undefined));
}

export type NewAppointment = {
  orgId: string;
  learnerId: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  kind: AppointmentKind;
  mode: AppointmentMode;
  location: string | null;
  notes: string | null;
  createdBy: string | null; // null : réservé par l'apprenant
  bookedOnline?: boolean;
};

export async function createAdmissionAppointment(
  supabase: SupabaseClient,
  rdv: NewAppointment,
): Promise<{ ok: true; id: string } | { ok: false; error: PgError }> {
  const { data, error } = await supabase
    .from("admission_appointments")
    .insert({
      org_id: rdv.orgId,
      learner_id: rdv.learnerId,
      starts_at: rdv.startsAt,
      ends_at: rdv.endsAt,
      kind: rdv.kind,
      mode: rdv.mode,
      location: rdv.location?.trim() || null,
      notes: rdv.notes?.trim() || null,
      created_by: rdv.createdBy,
      // Colonne de 0053 : écrite seulement quand elle sert (une pose depuis l'ERP
      // reste possible même si 0053 n'est pas encore appliquée).
      ...(rdv.bookedOnline ? { booked_online: true } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ?? { message: "création impossible" } };

  await supabase.from("learner_contacts").insert({
    org_id: rdv.orgId,
    learner_id: rdv.learnerId,
    channel: channelForMode(rdv.mode),
    outcome: "convoque",
    note: appointmentJournalNote("pose", { startsAt: rdv.startsAt, mode: rdv.mode, kind: rdv.kind, bookedOnline: rdv.bookedOnline }),
    created_by: rdv.createdBy,
  });
  await advanceAdmissionStatus(supabase, [rdv.learnerId], "convoque");

  pushAppointmentLater(data.id);
  return { ok: true, id: data.id };
}

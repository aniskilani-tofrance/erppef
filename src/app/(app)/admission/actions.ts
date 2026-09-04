"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { localToUtc } from "@/lib/dates";
import { sendMail } from "@/lib/mailer";
import {
  ADMISSION_STATUS_CODES,
  INVITATION_STATUS_CODES,
  nextAdmissionStatus,
  type AdmissionStatus,
} from "@/lib/admission/status";
import { buildMeetingInvitationMessage, textToHtml } from "@/lib/admission/messages";
import { LEVELS } from "@/lib/referentiels";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

function revalidateAdmission(meetingId?: string | null) {
  revalidatePath("/admission");
  if (meetingId) revalidatePath(`/admission/${meetingId}`);
  revalidatePath("/apprenants");
  revalidatePath("/dashboard");
}

// Fait avancer le statut d'admission d'apprenants (jamais de recul, « inscrit » définitif).
async function advanceStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

// ── Journal des contacts ─────────────────────────────────────────────────────
const contactSchema = z.object({
  learnerId: uuid,
  channel: z.enum(["whatsapp", "telephone", "sms", "email", "presentiel"]),
  outcome: z.enum(["message_envoye", "joint", "sans_reponse", "convoque", "refus", "autre"]),
  note: z.string().nullable(),
  // Statut choisi dans le dialog (pré-rempli d'après le résultat, modifiable) ;
  // null = ne pas toucher au statut (ex. bouton WhatsApp : on avance juste à « contacté »).
  status: z.enum(ADMISSION_STATUS_CODES).nullable(),
});

export async function logContact(raw: z.infer<typeof contactSchema>): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: d.learnerId,
    channel: d.channel,
    outcome: d.outcome,
    note: d.note?.trim() || null,
    created_by: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };

  if (d.status) {
    const { error: statusError } = await supabase
      .from("learners")
      .update({ admission_status: d.status })
      .eq("id", d.learnerId)
      .eq("org_id", orgId);
    if (statusError) return { ok: false, error: translatePgError(statusError) };
  } else {
    await advanceStatus(supabase, [d.learnerId], "contacte");
  }

  revalidateAdmission();
  return { ok: true };
}

export async function setAdmissionStatus(raw: { learnerId: string; status: AdmissionStatus }): Promise<ActionResult> {
  const parsed = z.object({ learnerId: uuid, status: z.enum(ADMISSION_STATUS_CODES) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("learners")
    .update({ admission_status: parsed.data.status })
    .eq("id", parsed.data.learnerId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission();
  return { ok: true };
}

// ── Réunions d'information ───────────────────────────────────────────────────
const meetingSchema = z.object({
  id: uuid.optional(),
  title: z.string().min(1),
  date: day,
  startTime: time,
  endTime: time.nullable(),
  roomId: uuid.nullable(),
  location: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
});

export type MeetingResult = { ok: true; id: string } | { ok: false; error: string };

export async function upsertInfoMeeting(raw: z.infer<typeof meetingSchema>): Promise<MeetingResult> {
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides (titre, date et heure obligatoires)" };
  const d = parsed.data;
  if (d.endTime && d.endTime <= d.startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    title: d.title.trim(),
    starts_at: localToUtc(d.date, d.startTime),
    ends_at: d.endTime ? localToUtc(d.date, d.endTime) : null,
    room_id: d.roomId,
    location: d.location?.trim() || null,
    capacity: d.capacity,
    notes: d.notes?.trim() || null,
  };

  if (d.id) {
    const { error } = await supabase.from("info_meetings").update(row).eq("id", d.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
    revalidateAdmission(d.id);
    return { ok: true, id: d.id };
  }
  const { data, error } = await supabase.from("info_meetings").insert(row).select("id").single();
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(data.id);
  return { ok: true, id: data.id };
}

export async function deleteInfoMeeting(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Réunion invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("info_meetings").delete().eq("id", id).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(id);
  return { ok: true };
}

// ── Convocations ─────────────────────────────────────────────────────────────
export type InviteResult = { ok: true; invited: number } | { ok: false; error: string };

// Ajoute des apprenants à la liste des convoqués (doublons ignorés) et passe
// leur statut d'admission à « convoqué ». L'envoi (WhatsApp/email) se fait ensuite,
// personne par personne, depuis la page de la réunion.
export async function inviteToMeeting(raw: { meetingId: string; learnerIds: string[] }): Promise<InviteResult> {
  const parsed = z.object({ meetingId: uuid, learnerIds: z.array(uuid).min(1).max(300) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Sélection invalide" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: meeting } = await supabase.from("info_meetings").select("id").eq("id", d.meetingId).eq("org_id", orgId).single();
  if (!meeting) return { ok: false, error: "Réunion introuvable" };

  const { data: existing } = await supabase
    .from("info_meeting_invitations")
    .select("learner_id")
    .eq("meeting_id", d.meetingId);
  const already = new Set((existing ?? []).map((e) => e.learner_id));
  const fresh = d.learnerIds.filter((id) => !already.has(id));
  if (fresh.length) {
    const { error } = await supabase
      .from("info_meeting_invitations")
      .insert(fresh.map((learnerId) => ({ org_id: orgId, meeting_id: d.meetingId, learner_id: learnerId })));
    if (error) return { ok: false, error: translatePgError(error) };
  }
  await advanceStatus(supabase, d.learnerIds, "convoque");

  revalidateAdmission(d.meetingId);
  return { ok: true, invited: fresh.length };
}

type InvitationRow = {
  id: string;
  meeting_id: string;
  learner_id: string;
  status: string;
  learners: { first_name: string; last_name: string; email: string | null } | null;
  info_meetings: { starts_at: string; ends_at: string | null; location: string | null; rooms: { name: string } | null } | null;
};

async function loadInvitation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  invitationId: string,
): Promise<InvitationRow | null> {
  const { data } = await supabase
    .from("info_meeting_invitations")
    .select("id, meeting_id, learner_id, status, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name))")
    .eq("id", invitationId)
    .eq("org_id", orgId)
    .single();
  return (data as unknown as InvitationRow | null) ?? null;
}

// Marque une convocation comme envoyée (après ouverture de WhatsApp, un appel…)
// et trace le contact dans le journal. Une convocation déjà confirmée/présente
// n'est pas rétrogradée.
export async function markInvitationSent(raw: {
  invitationId: string;
  channel: "whatsapp" | "email" | "telephone" | "sms";
}): Promise<ActionResult> {
  const parsed = z.object({ invitationId: uuid, channel: z.enum(["whatsapp", "email", "telephone", "sms"]) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const inv = await loadInvitation(supabase, orgId, d.invitationId);
  if (!inv) return { ok: false, error: "Convocation introuvable" };

  const patch: Record<string, unknown> = { channel: d.channel, sent_at: new Date().toISOString() };
  if (inv.status === "a_envoyer") patch.status = "envoyee";
  const { error } = await supabase.from("info_meeting_invitations").update(patch).eq("id", inv.id);
  if (error) return { ok: false, error: translatePgError(error) };

  await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: inv.learner_id,
    channel: d.channel,
    outcome: "convoque",
    note: `Convocation à la réunion d'information${inv.info_meetings ? ` du ${new Date(inv.info_meetings.starts_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}`,
    created_by: userId,
  });
  await advanceStatus(supabase, [inv.learner_id], "convoque");

  revalidateAdmission(inv.meeting_id);
  return { ok: true };
}

function meetingPlace(m: NonNullable<InvitationRow["info_meetings"]>): string | null {
  return m.rooms?.name ? `${m.rooms.name}${m.location ? ` — ${m.location}` : ""}` : m.location;
}

async function sendOneInvitationEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  inv: InvitationRow,
  senderFirstName: string | null,
): Promise<ActionResult> {
  if (!inv.learners?.email) return { ok: false, error: "Cet apprenant n'a pas d'adresse email." };
  if (!inv.info_meetings) return { ok: false, error: "Réunion introuvable" };
  const text = buildMeetingInvitationMessage({
    learnerFirstName: inv.learners.first_name,
    senderFirstName,
    meeting: { startsAt: inv.info_meetings.starts_at, endsAt: inv.info_meetings.ends_at, place: meetingPlace(inv.info_meetings) },
  });
  const sent = await sendMail({
    to: inv.learners.email,
    subject: "Invitation à la réunion d'information — cours de français",
    html: textToHtml(text),
  });
  if (!sent) return { ok: false, error: "Envoi impossible (email non configuré ou refusé par le serveur)." };

  const patch: Record<string, unknown> = { channel: "email", sent_at: new Date().toISOString() };
  if (inv.status === "a_envoyer") patch.status = "envoyee";
  await supabase.from("info_meeting_invitations").update(patch).eq("id", inv.id);
  await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: inv.learner_id,
    channel: "email",
    outcome: "convoque",
    note: "Convocation à la réunion d'information envoyée par email",
    created_by: userId,
  });
  await advanceStatus(supabase, [inv.learner_id], "convoque");
  return { ok: true };
}

async function senderName(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  return data?.full_name?.trim().split(/\s+/)[0] ?? null;
}

export async function sendInvitationEmail(invitationId: string): Promise<ActionResult> {
  if (!uuid.safeParse(invitationId).success) return { ok: false, error: "Convocation invalide" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const inv = await loadInvitation(supabase, orgId, invitationId);
  if (!inv) return { ok: false, error: "Convocation introuvable" };
  const result = await sendOneInvitationEmail(supabase, orgId, userId, inv, await senderName(supabase, userId));
  if (result.ok) revalidateAdmission(inv.meeting_id);
  return result;
}

export type BulkEmailResult = { ok: true; sent: number; skipped: number } | { ok: false; error: string };

// Envoie par email toutes les convocations « à envoyer » des apprenants qui ont
// un email (les autres restent à envoyer via WhatsApp).
export async function sendPendingInvitationEmails(meetingId: string): Promise<BulkEmailResult> {
  if (!uuid.safeParse(meetingId).success) return { ok: false, error: "Réunion invalide" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("info_meeting_invitations")
    .select("id, meeting_id, learner_id, status, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name))")
    .eq("meeting_id", meetingId)
    .eq("org_id", orgId)
    .eq("status", "a_envoyer");
  const rows = (data as unknown as InvitationRow[] | null) ?? [];
  const sender = await senderName(supabase, userId);

  let sent = 0;
  let skipped = 0;
  for (const inv of rows) {
    if (!inv.learners?.email) {
      skipped += 1;
      continue;
    }
    const r = await sendOneInvitationEmail(supabase, orgId, userId, inv, sender);
    if (r.ok) sent += 1;
    else skipped += 1;
  }
  revalidateAdmission(meetingId);
  return { ok: true, sent, skipped };
}

export async function setInvitationStatus(raw: { invitationId: string; status: string }): Promise<ActionResult> {
  const parsed = z.object({ invitationId: uuid, status: z.enum(INVITATION_STATUS_CODES) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const inv = await loadInvitation(supabase, orgId, parsed.data.invitationId);
  if (!inv) return { ok: false, error: "Convocation introuvable" };
  const { error } = await supabase
    .from("info_meeting_invitations")
    .update({ status: parsed.data.status })
    .eq("id", inv.id);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(inv.meeting_id);
  return { ok: true };
}

export async function removeInvitation(invitationId: string): Promise<ActionResult> {
  if (!uuid.safeParse(invitationId).success) return { ok: false, error: "Convocation invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const inv = await loadInvitation(supabase, orgId, invitationId);
  if (!inv) return { ok: false, error: "Convocation introuvable" };
  const { error } = await supabase.from("info_meeting_invitations").delete().eq("id", inv.id);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(inv.meeting_id);
  return { ok: true };
}

// ── Test oral ────────────────────────────────────────────────────────────────
const oralSchema = z.object({
  learnerId: uuid,
  on: day,
  level: z.enum(LEVELS).nullable(),
  evaluator: z.string().nullable(),
  comment: z.string().nullable(),
  // Recopier le niveau oral dans le « Niveau évalué » de la fiche (positionnement d'entrée)
  applyLevel: z.boolean(),
  meetingId: uuid.nullable().optional(),
});

// Enregistre le test oral d'entrée : date, niveau, évaluateur, commentaire.
// Le statut d'admission passe à « évalué ».
export async function recordOralTest(raw: z.infer<typeof oralSchema>): Promise<ActionResult> {
  const parsed = oralSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides (date obligatoire)" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const patch: Record<string, unknown> = {
    oral_test_on: d.on,
    oral_test_level: d.level,
    oral_test_evaluator: d.evaluator?.trim() || null,
    oral_test_comment: d.comment?.trim() || null,
  };
  if (d.applyLevel && d.level) patch.level_assessed = d.level;
  const { error } = await supabase.from("learners").update(patch).eq("id", d.learnerId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await advanceStatus(supabase, [d.learnerId], "evalue");

  revalidateAdmission(d.meetingId ?? null);
  return { ok: true };
}

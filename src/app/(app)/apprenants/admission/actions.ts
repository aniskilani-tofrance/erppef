"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { randomBytes } from "node:crypto";
import { ensureConvocationTests } from "@/lib/placement/convocation-test-server";
import { localToUtc, utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { clockLabel, parseClock, spreadTimes, orderForSpacing, whenForInvitation, MAX_PARALLEL, MAX_STEP_MINUTES, MIN_STEP_MINUTES } from "@/lib/admission/convocation";
import { sendMail } from "@/lib/mailer";
import {
  ADMISSION_REASON_CODES,
  ADMISSION_STATUS_CODES,
  INVITATION_STATUS_CODES,
  reasonFits,
  type AdmissionStatus,
} from "@/lib/admission/status";
import { buildMeetingInvitationMessage, formatMeetingPlace, textToHtml } from "@/lib/admission/messages";
import { loadTemplates } from "@/lib/admission/load-templates";
import { DEFAULT_TEMPLATES, MESSAGE_STAGES, type Templates } from "@/lib/admission/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEVELS } from "@/lib/referentiels";
import { aiConfigured } from "@/lib/ai/client";
import { hasReminderCue } from "@/lib/ai/prompts";
import { extractReminderFromNote } from "@/app/(app)/assistant/actions";
import {
  APPOINTMENT_KIND_CODES,
  APPOINTMENT_MODE_CODES,
  appointmentJournalNote,
  channelForMode,
  isAdmissionKind,
} from "@/lib/admission/appointments";
import {
  advanceAdmissionStatus as advanceStatus,
  createAdmissionAppointment,
  pushAppointmentLater as pushLater,
} from "@/lib/admission/appointments-server";
import { isSlotFree, type FreeSlot } from "@/lib/admission/slots";
import { loadFreeSlots } from "@/lib/admission/slots-server";
import { BULK_TEST_STATUSES, pickBulkTestTargets, type BulkTarget } from "@/lib/placement/bulk";
import { signupToggleTargets } from "@/lib/inscription/meeting";
import {
  LINK_QUEUE_NOTE, LINK_QUEUE_NOTE_PREFIX, LINK_QUEUE_SMS_NOTE, LINK_RECENT_DAYS, pickLinkQueue, type LinkQueueContact, type LinkQueueInvitation, type LinkTarget,
} from "@/lib/inscription/link-queue";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

function revalidateAdmission(meetingId?: string | null) {
  revalidatePath("/apprenants/admission");
  if (meetingId) revalidatePath(`/apprenants/reunions/${meetingId}`);
  revalidatePath("/apprenants");
  revalidatePath("/dashboard");
}

// ── Journal des contacts ─────────────────────────────────────────────────────
const contactSchema = z.object({
  learnerId: uuid,
  channel: z.enum(["whatsapp", "telephone", "sms", "email", "presentiel"]),
  outcome: z.enum(["message_envoye", "joint", "sans_reponse", "convoque", "place_refusee", "refus", "autre"]),
  note: z.string().nullable(),
  // Statut choisi dans le dialog (pré-rempli d'après le résultat, modifiable) ;
  // null = ne pas toucher au statut (ex. bouton WhatsApp : on avance juste à « contacté »).
  status: z.enum(ADMISSION_STATUS_CODES).nullable(),
  // Motif de liste d'attente / sans suite (obligatoire dans le dialog, optionnel pour l'assistant).
  reason: z.enum(ADMISSION_REASON_CODES).nullable().optional(),
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
    reason: reasonFits(d.reason, d.status) ? d.reason : null,
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

  // « Rappeler jeudi après 17h » dans la note → rappel daté dans « À faire aujourd'hui »
  // (après la réponse, sans la ralentir ; silencieux si l'assistant est absent ou se trompe).
  const note = d.note?.trim() ?? "";
  if (note && aiConfigured() && hasReminderCue(note)) {
    after(() => extractReminderFromNote({ orgId, userId, learnerId: d.learnerId, note }).catch(() => undefined));
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
  // Inscription en ligne par lien (page publique /inscription/reunion/<jeton>) : le nombre
  // maximum d'apprenants est alors obligatoire (aussi imposé en base par la migration 0056).
  signupOpen: z.boolean().default(false),
  oralTestIncluded: z.boolean().default(true),
  // Accueil échelonné (0058) : une arrivée toutes les N minutes, K personnes accueillies en même
  // temps ; chaque inscrit par le lien reçoit la première heure libre. null = tous à l'heure de la réunion.
  staggerMinutes: z.number().int().min(MIN_STEP_MINUTES).max(MAX_STEP_MINUTES).nullable().default(null),
  staggerParallel: z.number().int().min(1).max(MAX_PARALLEL).nullable().default(null),
});

export type MeetingResult = { ok: true; id: string } | { ok: false; error: string };

const SIGNUP_NEEDS_CAPACITY = "Indiquez le nombre maximum de places pour ouvrir l'inscription par lien.";

export async function upsertInfoMeeting(raw: z.infer<typeof meetingSchema>): Promise<MeetingResult> {
  const parsed = meetingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides (titre, date et heure obligatoires)" };
  const d = parsed.data;
  if (d.endTime && d.endTime <= d.startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };
  if (d.signupOpen && !d.capacity) return { ok: false, error: SIGNUP_NEEDS_CAPACITY };

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
    signup_open: d.signupOpen,
    oral_test_included: d.oralTestIncluded,
    stagger_minutes: d.staggerMinutes,
    stagger_parallel: d.staggerMinutes ? (d.staggerParallel ?? 1) : null,
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

// Ouvre ou ferme l'inscription par lien (bouton de la carte « Inscription par lien »). Les créneaux
// d'un même lien s'ouvrent et se ferment ENSEMBLE : le lien est commun (ouvrir un seul créneau
// laissait les autres fermés, donc absents de la page). Ouvrir ne touche que les créneaux à venir
// et exige un nombre maximum de places sur chacun.
export async function setMeetingSignupOpen(raw: { meetingId: string; open: boolean }): Promise<ActionResult & { count?: number }> {
  const parsed = z.object({ meetingId: uuid, open: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Réunion invalide" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("info_meetings")
    .select("id, capacity, starts_at, series_token")
    .eq("id", d.meetingId)
    .eq("org_id", orgId)
    .single();
  if (!meeting) return { ok: false, error: "Réunion introuvable" };
  const { data: seriesRows } = meeting.series_token
    ? await supabase.from("info_meetings").select("id, capacity, starts_at").eq("org_id", orgId).eq("series_token", meeting.series_token)
    : { data: [meeting] };
  const slots = (seriesRows ?? [meeting]).map((r) => ({ id: r.id as string, startsAt: r.starts_at as string, capacity: (r.capacity as number | null) ?? null }));

  const target = signupToggleTargets(slots, d.open);
  if (!target.ok) {
    if (target.reason === "started") return { ok: false, error: slots.length > 1 ? "Tous les créneaux ont déjà commencé." : "La réunion a déjà commencé." };
    return {
      ok: false,
      error:
        slots.length > 1
          ? `${target.missing} créneau${target.missing > 1 ? "x" : ""} sans nombre maximum de places : « Modifier » sur ${target.missing > 1 ? "chacun" : "ce créneau"} avant d'ouvrir le lien.`
          : SIGNUP_NEEDS_CAPACITY.replace("pour ouvrir", "(« Modifier ») pour ouvrir"),
    };
  }

  const { error } = await supabase.from("info_meetings").update({ signup_open: d.open }).in("id", target.ids).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  for (const id of new Set([d.meetingId, ...target.ids])) revalidateAdmission(id);
  return { ok: true, count: target.ids.length };
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
  // Test de niveau : chaque convoqué qui ne l'a pas fait reçoit SON lien (un test par apprenant,
  // rattaché à sa fiche), ajouté ensuite à la convocation et au rappel.
  await ensureConvocationTests(supabase, orgId, d.learnerIds);

  revalidateAdmission(d.meetingId);
  return { ok: true, invited: fresh.length };
}

// ── « Envoyer le lien à la suite » ───────────────────────────────────────────
// Le lien d'une réunion vaut pour tous ses créneaux (series_token) : la file reprend les convoqués
// de tous les créneaux du lien qui n'ont pas encore de place (pickLinkQueue).
async function seriesMeetingIds(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, meetingId: string): Promise<string[] | null> {
  const { data: meeting } = await supabase.from("info_meetings").select("id, series_token").eq("id", meetingId).eq("org_id", orgId).single();
  if (!meeting) return null;
  if (!meeting.series_token) return [meeting.id as string];
  const { data } = await supabase.from("info_meetings").select("id").eq("org_id", orgId).eq("series_token", meeting.series_token);
  return (data ?? []).map((m) => m.id as string);
}

export type LinkQueueResult = { ok: true; targets: LinkTarget[]; skippedRegistered: number } | { ok: false; error: string };

export async function prepareMeetingLinkQueue(meetingId: string): Promise<LinkQueueResult> {
  if (!uuid.safeParse(meetingId).success) return { ok: false, error: "Réunion invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const ids = await seriesMeetingIds(supabase, orgId, meetingId);
  if (!ids) return { ok: false, error: "Réunion introuvable" };

  const { data: invitations, error } = await supabase
    .from("info_meeting_invitations")
    .select("learner_id, status, created_at, learners(first_name, last_name, phone)")
    .eq("org_id", orgId)
    .in("meeting_id", ids);
  if (error) return { ok: false, error: translatePgError(error) };
  const rows = (invitations ?? []) as unknown as LinkQueueInvitation[];
  const learnerIds = [...new Set(rows.map((r) => r.learner_id))];
  const since = new Date(Date.now() - LINK_RECENT_DAYS * 86_400_000).toISOString();
  const { data: contacts } = learnerIds.length
    ? await supabase
        .from("learner_contacts")
        .select("learner_id, contacted_at, note")
        .eq("org_id", orgId)
        .in("learner_id", learnerIds)
        .gte("contacted_at", since)
        .like("note", `${LINK_QUEUE_NOTE_PREFIX}%`)
    : { data: [] };
  return { ok: true, ...pickLinkQueue(rows, (contacts ?? []) as LinkQueueContact[]) };
}

// Un envoi de la file (WhatsApp ou SMS) : trace au journal, convocations « à envoyer » du lien
// passées « envoyée », statut d'admission « convoqué » (jamais de recul).
export async function markMeetingLinkSent(raw: { meetingId: string; learnerId: string; channel?: "whatsapp" | "sms" }): Promise<ActionResult> {
  const parsed = z.object({ meetingId: uuid, learnerId: uuid, channel: z.enum(["whatsapp", "sms"]).default("whatsapp") }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const ids = await seriesMeetingIds(supabase, orgId, d.meetingId);
  if (!ids) return { ok: false, error: "Réunion introuvable" };

  const { error } = await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: d.learnerId,
    channel: d.channel,
    outcome: "message_envoye",
    note: d.channel === "sms" ? LINK_QUEUE_SMS_NOTE : LINK_QUEUE_NOTE,
    created_by: userId,
  });
  if (error) return { ok: false, error: translatePgError(error) };
  await supabase
    .from("info_meeting_invitations")
    .update({ status: "envoyee", channel: d.channel, sent_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("learner_id", d.learnerId)
    .in("meeting_id", ids)
    .eq("status", "a_envoyer");
  await advanceStatus(supabase, [d.learnerId], "convoque");
  for (const id of ids) revalidateAdmission(id);
  return { ok: true };
}

// Prépare les tests de niveau des personnes déjà convoquées qui n'ont pas encore leur lien (convoquées
// avant cette fonction, ou lien non créé). Les messages de la page de la réunion les contiennent ensuite.
export async function prepareMeetingTests(meetingId: string): Promise<ActionResult & { created?: number }> {
  if (!uuid.safeParse(meetingId).success) return { ok: false, error: "Réunion invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("info_meeting_invitations")
    .select("learner_id")
    .eq("meeting_id", meetingId)
    .eq("org_id", orgId)
    .not("status", "in", "(excusee,absente)");
  const { created } = await ensureConvocationTests(supabase, orgId, (data ?? []).map((r) => r.learner_id as string));
  revalidateAdmission(meetingId);
  return { ok: true, created };
}

type InvitationRow = {
  id: string;
  meeting_id: string;
  learner_id: string;
  status: string;
  convocation_at: string | null; // heure propre à la personne (null = celle de la réunion)
  learners: { first_name: string; last_name: string; email: string | null } | null;
  info_meetings: { starts_at: string; ends_at: string | null; location: string | null; rooms: { name: string; address: string | null; access_notes: string | null } | null } | null;
};

async function loadInvitation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  invitationId: string,
): Promise<InvitationRow | null> {
  const { data } = await supabase
    .from("info_meeting_invitations")
    .select("id, meeting_id, learner_id, status, convocation_at, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name, address, access_notes))")
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
    note: `Convocation à la réunion d'information${inv.info_meetings ? ` du ${new Date(inv.info_meetings.starts_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}${inv.convocation_at ? ` (convoqué(e) à ${clockLabel(inv.convocation_at)})` : ""}`,
    created_by: userId,
  });
  await advanceStatus(supabase, [inv.learner_id], "convoque");

  revalidateAdmission(inv.meeting_id);
  return { ok: true };
}

function meetingPlace(m: NonNullable<InvitationRow["info_meetings"]>): string | null {
  return formatMeetingPlace(m.rooms?.name, m.location, m.rooms?.address);
}

async function sendOneInvitationEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  inv: InvitationRow,
  senderFirstName: string | null,
  testUrl: string | null, // lien du test de niveau de CETTE personne (null : déjà fait)
): Promise<ActionResult> {
  if (!inv.learners?.email) return { ok: false, error: "Cet apprenant n'a pas d'adresse email." };
  if (!inv.info_meetings) return { ok: false, error: "Réunion introuvable" };
  const text = buildMeetingInvitationMessage({
    learnerFirstName: inv.learners.first_name,
    senderFirstName,
    testUrl,
    meeting: whenForInvitation(
      { startsAt: inv.info_meetings.starts_at, endsAt: inv.info_meetings.ends_at, place: meetingPlace(inv.info_meetings), access: inv.info_meetings.rooms?.access_notes ?? null },
      inv.convocation_at,
    ),
    templates: await loadTemplates(supabase, orgId),
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
  // Le test de niveau part avec la convocation : lien créé pour CETTE personne si elle n'en a pas.
  const { urls } = await ensureConvocationTests(supabase, orgId, [inv.learner_id]);
  const result = await sendOneInvitationEmail(supabase, orgId, userId, inv, await senderName(supabase, userId), urls.get(inv.learner_id) ?? null);
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
    .select("id, meeting_id, learner_id, status, convocation_at, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name, address, access_notes))")
    .eq("meeting_id", meetingId)
    .eq("org_id", orgId)
    .eq("status", "a_envoyer");
  const rows = (data as unknown as InvitationRow[] | null) ?? [];
  const sender = await senderName(supabase, userId);
  const { urls } = await ensureConvocationTests(supabase, orgId, rows.filter((r) => r.learners?.email).map((r) => r.learner_id));

  let sent = 0;
  let skipped = 0;
  for (const inv of rows) {
    if (!inv.learners?.email) {
      skipped += 1;
      continue;
    }
    const r = await sendOneInvitationEmail(supabase, orgId, userId, inv, sender, urls.get(inv.learner_id) ?? null);
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

// ── Heure de convocation de chaque personne ──────────────────────────────────
// La réunion a une date et une heure ; chaque convoqué peut avoir SA heure d'arrivée, le même
// jour (test oral échelonné). null = l'heure de la réunion. Elle part dans les messages
// WhatsApp, les emails et le rappel de la veille. Une autre DATE = un autre créneau (addMeetingSlot).
export async function setInvitationConvocation(raw: { invitationId: string; time: string | null }): Promise<ActionResult> {
  const parsed = z.object({ invitationId: uuid, time: time.nullable() }).safeParse(raw);
  if (!parsed.success || (parsed.data.time !== null && parseClock(parsed.data.time) === null)) return { ok: false, error: "Heure invalide" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const inv = await loadInvitation(supabase, orgId, d.invitationId);
  if (!inv?.info_meetings) return { ok: false, error: "Convocation introuvable" };

  // Même heure que la réunion : on revient à « l'heure de la réunion » (et sa fin s'affiche à nouveau).
  const sameAsMeeting = d.time !== null && d.time === utcToLocalTime(inv.info_meetings.starts_at);
  const convocationAt = d.time && !sameAsMeeting ? localToUtc(utcToLocalDate(inv.info_meetings.starts_at), d.time) : null;
  const { error } = await supabase.from("info_meeting_invitations").update({ convocation_at: convocationAt }).eq("id", inv.id);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(inv.meeting_id);
  return { ok: true };
}

export type SpaceResult =
  | { ok: true; count: number; first: string; last: string; afterEnd: boolean }
  | { ok: false; error: string };

// Espace les heures de convocation : la première à `firstTime`, puis une toutes les `minutes`
// minutes, `parallel` personnes à la fois (accueillants), par ordre d'inscription ou par nom.
// `who` : « confirmes » = seulement les personnes qui ont confirmé (premier inscrit, premier servi :
// les convoqués sans réponse n'ont pas de place) ; « tous » = aussi les convocations à envoyer ou
// envoyées. Les présents, absents et excusés sont toujours laissés de côté.
export async function spaceMeetingConvocations(raw: {
  meetingId: string;
  firstTime: string;
  minutes: number;
  order: "inscription" | "alphabetique";
  parallel?: number;
  who?: "confirmes" | "tous";
}): Promise<SpaceResult> {
  const parsed = z
    .object({
      meetingId: uuid,
      firstTime: time,
      minutes: z.number().int().min(MIN_STEP_MINUTES).max(MAX_STEP_MINUTES),
      order: z.enum(["inscription", "alphabetique"]),
      parallel: z.number().int().min(1).max(MAX_PARALLEL).default(1),
      who: z.enum(["confirmes", "tous"]).default("tous"),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Heure de départ, durée (${MIN_STEP_MINUTES} à ${MAX_STEP_MINUTES} minutes) et personnes en même temps (1 à ${MAX_PARALLEL}) obligatoires.` };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: meeting } = await supabase.from("info_meetings").select("id, starts_at, ends_at").eq("id", d.meetingId).eq("org_id", orgId).single();
  if (!meeting) return { ok: false, error: "Réunion introuvable" };
  const { data: rows } = await supabase
    .from("info_meeting_invitations")
    .select("id, created_at, learners(first_name, last_name)")
    .eq("meeting_id", d.meetingId)
    .eq("org_id", orgId)
    .in("status", d.who === "confirmes" ? ["confirmee"] : ["a_envoyer", "envoyee", "confirmee"]);
  const people =((rows ?? []) as unknown as { id: string; created_at: string; learners: { first_name: string; last_name: string } | null }[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    firstName: r.learners?.first_name ?? "",
    lastName: r.learners?.last_name ?? "",
  }));
  if (people.length === 0) {
    return {
      ok: false,
      error: d.who === "confirmes" ? "Aucune personne confirmée à placer." : "Aucun convoqué à placer (les présents, absents et excusés sont laissés de côté).",
    };
  }

  const spread = spreadTimes(d.firstTime, d.minutes, people.length, d.parallel);
  if (!spread.ok) return spread;

  const meetingDay = utcToLocalDate(meeting.starts_at);
  const ordered = orderForSpacing(people, d.order);
  for (const [i, p] of ordered.entries()) {
    const { error } = await supabase
      .from("info_meeting_invitations")
      .update({ convocation_at: localToUtc(meetingDay, spread.times[i]) })
      .eq("id", p.id);
    if (error) return { ok: false, error: translatePgError(error) };
  }

  const last = spread.times[spread.times.length - 1];
  const afterEnd = Boolean(meeting.ends_at) && last >= utcToLocalTime(meeting.ends_at as string);
  revalidateAdmission(d.meetingId);
  return { ok: true, count: people.length, first: spread.times[0], last, afterEnd };
}

// Tout le monde revient à l'heure de la réunion.
export async function clearMeetingConvocations(meetingId: string): Promise<ActionResult> {
  if (!uuid.safeParse(meetingId).success) return { ok: false, error: "Réunion invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("info_meeting_invitations")
    .update({ convocation_at: null })
    .eq("meeting_id", meetingId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(meetingId);
  return { ok: true };
}

// ── Plusieurs créneaux sur un même lien ──────────────────────────────────────
// Chaque créneau est une réunion à part entière (date, heure, places maximum, convoqués, présence).
// Les créneaux d'un même lien partagent `series_token` : la page publique de ce lien propose
// leurs jours et heures, la personne choisit. Le créneau ajouté reprend le titre, la salle, le
// lieu, le test oral et l'état d'ouverture de la réunion d'où on le crée.
const slotSchema = z.object({
  meetingId: uuid,
  date: day,
  startTime: time,
  endTime: time.nullable(),
  capacity: z.number().int().positive(),
});

export async function addMeetingSlot(raw: z.infer<typeof slotSchema>): Promise<MeetingResult> {
  const parsed = slotSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Date, heure de début et nombre maximum de places obligatoires." };
  const d = parsed.data;
  if (d.endTime && d.endTime <= d.startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("info_meetings")
    .select("id, title, room_id, location, notes, oral_test_included, signup_open, series_token, stagger_minutes, stagger_parallel")
    .eq("id", d.meetingId)
    .eq("org_id", orgId)
    .single();
  if (!source) return { ok: false, error: "Réunion introuvable" };

  // Premier créneau ajouté : la réunion d'origine et le nouveau créneau partagent un jeton commun.
  const seriesToken: string = source.series_token ?? randomBytes(16).toString("hex");
  if (!source.series_token) {
    const { error } = await supabase.from("info_meetings").update({ series_token: seriesToken }).eq("id", source.id).eq("org_id", orgId);
    if (error) return { ok: false, error: translatePgError(error) };
  }
  // Le lien est commun : si un créneau du lien est ouvert, le nouveau l'est aussi (sinon il resterait
  // invisible sur la page du lien sans qu'on le voie).
  const { data: seriesOpen } = await supabase
    .from("info_meetings")
    .select("id")
    .eq("org_id", orgId)
    .eq("series_token", seriesToken)
    .eq("signup_open", true)
    .limit(1);
  const open = Boolean(source.signup_open) || Boolean(seriesOpen?.length);

  const { data, error } = await supabase
    .from("info_meetings")
    .insert({
      org_id: orgId,
      title: source.title,
      starts_at: localToUtc(d.date, d.startTime),
      ends_at: d.endTime ? localToUtc(d.date, d.endTime) : null,
      room_id: source.room_id,
      location: source.location,
      capacity: d.capacity,
      notes: source.notes,
      oral_test_included: source.oral_test_included,
      stagger_minutes: source.stagger_minutes,
      stagger_parallel: source.stagger_parallel,
      signup_open: open,
      series_token: seriesToken,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: translatePgError(error) };
  revalidateAdmission(source.id);
  return { ok: true, id: data.id };
}

// ── Modèles de messages ──────────────────────────────────────────────────────
const templatesSchema = z.record(z.string(), z.string().max(4000));

// Retouches des messages par étape, pour tout l'organisme (organizations.settings).
// Un texte identique au défaut n'est pas stocké : le défaut du code reste la référence.
export async function saveMessageTemplates(raw: Record<string, string>): Promise<ActionResult> {
  const parsed = templatesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Textes invalides (4000 caractères maximum)" };
  const { orgId } = await requireRole(["admin", "coordinator"]);

  const overrides: Partial<Templates> = {};
  for (const s of MESSAGE_STAGES) {
    const v = parsed.data[s.code]?.trim();
    if (v && v !== DEFAULT_TEMPLATES[s.code]) overrides[s.code] = v;
  }
  // La RLS réserve la mise à jour de l'organisation à l'admin : la coordination passe par
  // le client service_role, après requireRole, sur la seule clé whatsapp_templates.
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = { ...((org?.settings as Record<string, unknown> | null) ?? {}), whatsapp_templates: overrides };
  const { error } = await admin.from("organizations").update({ settings }).eq("id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };

  revalidateAdmission();
  revalidatePath("/apprenants/reunions", "layout");
  return { ok: true };
}

// ── Entretien oral d'entrée ──────────────────────────────────────────────────
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

// Enregistre l'entretien oral d'entrée : date, niveau, évaluateur, commentaire.
// Le statut d'admission passe à « évalué ».
//
// La date sert aussi de date d'entretien d'entrée (preuve Qualiopi ind. 4) : dans notre
// organisation, la réunion d'information, l'entretien oral et l'entretien d'entrée ont
// lieu le même jour. Elle n'est recopiée que si le champ est vide, jamais par-dessus une
// date saisie à la main, et elle reste modifiable dans le bloc « Analyse du besoin ».
export async function recordOralTest(raw: z.infer<typeof oralSchema>): Promise<ActionResult> {
  const parsed = oralSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides (date obligatoire)" };
  const d = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: existant } = await supabase
    .from("learners")
    .select("entry_interview_on")
    .eq("id", d.learnerId)
    .eq("org_id", orgId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    oral_test_on: d.on,
    oral_test_level: d.level,
    oral_test_evaluator: d.evaluator?.trim() || null,
    oral_test_comment: d.comment?.trim() || null,
  };
  if (!existant?.entry_interview_on) patch.entry_interview_on = d.on;
  if (d.applyLevel && d.level) patch.level_assessed = d.level;
  const { error } = await supabase.from("learners").update(patch).eq("id", d.learnerId).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  await advanceStatus(supabase, [d.learnerId], "evalue");

  revalidateAdmission(d.meetingId ?? null);
  return { ok: true };
}

// ── Rendez-vous d'admission individuels ──────────────────────────────────────
// Un RDV (entretien, test oral…) avec une personne : trace dans le journal des contacts,
// statut « convoqué » à la pose (jamais de recul), et événement dans l'agenda Google
// « Admissions PEF — Rendez-vous », poussé après la réponse (after) pour ne pas la
// ralentir. Un échec Google est noté sur le RDV (gcal_error) ; la passe nocturne réessaie.
const appointmentSchema = z.object({
  id: uuid.optional(),
  learnerId: uuid,
  date: day,
  startTime: time,
  durationMinutes: z.number().int().min(5).max(480),
  kind: z.enum(APPOINTMENT_KIND_CODES),
  mode: z.enum(APPOINTMENT_MODE_CODES),
  location: z.string().max(300).nullable(),
  notes: z.string().max(2000).nullable(),
  // Posé en touchant un créneau proposé : on revérifie qu'il est toujours libre.
  fromSlot: z.boolean().optional(),
});

export type AppointmentResult = { ok: true; id: string } | { ok: false; error: string };

export async function upsertAdmissionAppointment(raw: z.infer<typeof appointmentSchema>): Promise<AppointmentResult> {
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides (date, heure et durée obligatoires)" };
  const d = parsed.data;

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const startsAt = localToUtc(d.date, d.startTime);
  const endsAt = new Date(Date.parse(startsAt) + d.durationMinutes * 60_000).toISOString();

  if (d.fromSlot) {
    let slots: FreeSlot[];
    try {
      slots = await loadFreeSlots(supabase, orgId, { excludeAppointmentId: d.id ?? null });
    } catch {
      return { ok: false, error: "Impossible de vérifier le créneau : réessayez dans un instant." };
    }
    if (!isSlotFree(slots, startsAt, d.durationMinutes)) {
      return {
        ok: false,
        error: "Ce créneau n'est plus libre (pris entre-temps, bloqué ou trop proche). Choisissez-en un autre, ou « Autre horaire ».",
      };
    }
  }

  // Création : fonction commune avec la réservation en ligne (formulaire d'inscription).
  if (!d.id) {
    const created = await createAdmissionAppointment(supabase, {
      orgId,
      learnerId: d.learnerId,
      startsAt,
      endsAt,
      kind: d.kind,
      mode: d.mode,
      location: d.location,
      notes: d.notes,
      createdBy: userId,
    });
    if (!created.ok) return { ok: false, error: translatePgError(created.error) };
    revalidateAdmission();
    return { ok: true, id: created.id };
  }

  // Déplacement / modification d'un RDV prévu.
  const { data: existing } = await supabase
    .from("admission_appointments")
    .select("id, learner_id, starts_at, status")
    .eq("id", d.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing || existing.learner_id !== d.learnerId) return { ok: false, error: "Rendez-vous introuvable" };
  if (existing.status !== "prevu") return { ok: false, error: "Ce rendez-vous n'est plus prévu : posez-en un nouveau." };
  const { error } = await supabase
    .from("admission_appointments")
    .update({
      starts_at: startsAt,
      ends_at: endsAt,
      kind: d.kind,
      mode: d.mode,
      location: d.location?.trim() || null,
      notes: d.notes?.trim() || null,
    })
    .eq("id", d.id)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };
  if (Date.parse(existing.starts_at) !== Date.parse(startsAt)) {
    await supabase.from("learner_contacts").insert({
      org_id: orgId,
      learner_id: d.learnerId,
      channel: channelForMode(d.mode),
      outcome: isAdmissionKind(d.kind) ? "convoque" : "autre",
      note: appointmentJournalNote("deplace", { startsAt, mode: d.mode, kind: d.kind }, existing.starts_at),
      created_by: userId,
    });
    if (isAdmissionKind(d.kind)) await advanceStatus(supabase, [d.learnerId], "convoque");
  }
  pushLater(d.id);
  revalidateAdmission();
  return { ok: true, id: d.id };
}

// Résultat ou annulation d'un RDV : honoré, absent(e), annulé. Chaque changement laisse
// une ligne au journal. Absent(e) → « injoignable » seulement si cela ne fait pas reculer
// (en pratique : jamais pour un « convoqué ») ; honoré ne change pas le statut (le test
// oral garde son propre dialogue). Annulé → l'événement Google est supprimé.
export async function setAdmissionAppointmentStatus(raw: {
  id: string;
  status: "honore" | "absent" | "annule";
}): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, status: z.enum(["honore", "absent", "annule"]) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: rdv } = await supabase
    .from("admission_appointments")
    .select("id, learner_id, starts_at, kind, mode, status")
    .eq("id", d.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!rdv) return { ok: false, error: "Rendez-vous introuvable" };
  if (rdv.status === d.status) return { ok: true };
  if (rdv.status === "annule") return { ok: false, error: "Ce rendez-vous est annulé : posez-en un nouveau." };

  const { error } = await supabase.from("admission_appointments").update({ status: d.status }).eq("id", rdv.id).eq("org_id", orgId);
  if (error) return { ok: false, error: translatePgError(error) };

  const outcome = d.status === "honore" ? "joint" : d.status === "absent" ? "sans_reponse" : "autre";
  await supabase.from("learner_contacts").insert({
    org_id: orgId,
    learner_id: rdv.learner_id,
    channel: channelForMode(rdv.mode),
    outcome,
    note: appointmentJournalNote(d.status, { startsAt: rdv.starts_at, mode: rdv.mode, kind: rdv.kind }),
    created_by: userId,
  });
  if (d.status === "absent" && isAdmissionKind(rdv.kind)) await advanceStatus(supabase, [rdv.learner_id], "injoignable");

  pushLater(rdv.id);
  revalidateAdmission();
  return { ok: true };
}

// Prochains créneaux libres (dialogue RDV). excludeAppointmentId : le RDV qu'on déplace
// ne bloque pas son propre créneau.
export async function listAdmissionFreeSlots(raw?: {
  excludeAppointmentId?: string | null;
}): Promise<{ ok: true; slots: FreeSlot[] } | { ok: false; error: string }> {
  const exclude = raw?.excludeAppointmentId ?? null;
  if (exclude && !uuid.safeParse(exclude).success) return { ok: false, error: "Données invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  try {
    return { ok: true, slots: await loadFreeSlots(supabase, orgId, { excludeAppointmentId: exclude }) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Créneaux indisponibles" };
  }
}

// ── Envoi groupé de l'invitation au test de positionnement ──────────────────
// « À contacter » et « Contacté » sans test fait ni niveau connu : on crée les tests
// manquants (un lien personnel chacun) et on renvoie la file d'envoi. Les messages
// partent ensuite un par un sur WhatsApp depuis l'écran (un toucher par personne) ;
// chaque envoi passe par logContact (journal + « À contacter » → « Contacté »).
export type BulkTestResult =
  | { ok: true; targets: BulkTarget[]; created: number; skippedDone: number }
  | { ok: false; error: string };

export async function prepareBulkPlacementTests(): Promise<BulkTestResult> {
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: learners, error } = await supabase
    .from("learners")
    .select("id, first_name, last_name, phone, admission_status, level_assessed, created_at")
    .eq("org_id", orgId)
    .in("admission_status", [...BULK_TEST_STATUSES]);
  if (error) return { ok: false, error: translatePgError(error) };
  const ids = (learners ?? []).map((l) => l.id as string);
  if (!ids.length) return { ok: true, targets: [], created: 0, skippedDone: 0 };

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: tests, error: testsError }, { data: contacts }] = await Promise.all([
    supabase.from("placement_tests").select("learner_id, status, token, created_at").eq("org_id", orgId).in("learner_id", ids),
    supabase.from("learner_contacts").select("learner_id, contacted_at, note").eq("org_id", orgId).in("learner_id", ids).gte("contacted_at", since),
  ]);
  if (testsError) return { ok: false, error: translatePgError(testsError) };

  const { targets, skippedDone } = pickBulkTestTargets(learners ?? [], tests ?? [], contacts ?? []);

  // Un lien personnel pour chaque personne joignable qui n'en a pas encore.
  const missing = targets.filter((t) => !t.token && t.phoneOk);
  let created = 0;
  if (missing.length) {
    const { data: rows, error: insertError } = await supabase
      .from("placement_tests")
      .insert(missing.map((t) => ({ org_id: orgId, learner_id: t.learnerId })))
      .select("learner_id, token");
    if (insertError) return { ok: false, error: translatePgError(insertError) };
    const tokenOf = new Map((rows ?? []).map((r) => [r.learner_id as string, r.token as string]));
    for (const t of targets) if (!t.token) t.token = tokenOf.get(t.learnerId) ?? null;
    created = rows?.length ?? 0;
  }

  if (created) {
    revalidateAdmission();
    revalidatePath("/apprenants");
  }
  return { ok: true, targets, created, skippedDone };
}

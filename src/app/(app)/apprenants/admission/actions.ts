"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { localToUtc } from "@/lib/dates";
import { sendMail } from "@/lib/mailer";
import {
  ADMISSION_REASON_CODES,
  ADMISSION_STATUS_CODES,
  INVITATION_STATUS_CODES,
  reasonFits,
  type AdmissionStatus,
} from "@/lib/admission/status";
import { buildMeetingInvitationMessage, textToHtml } from "@/lib/admission/messages";
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
  info_meetings: { starts_at: string; ends_at: string | null; location: string | null; rooms: { name: string; address: string | null; access_notes: string | null } | null } | null;
};

async function loadInvitation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  invitationId: string,
): Promise<InvitationRow | null> {
  const { data } = await supabase
    .from("info_meeting_invitations")
    .select("id, meeting_id, learner_id, status, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name, address, access_notes))")
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
  return m.rooms?.name ? `${m.rooms.name}${m.location ? ` — ${m.location}` : m.rooms.address ? ` — ${m.rooms.address}` : ""}` : m.location;
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
    meeting: { startsAt: inv.info_meetings.starts_at, endsAt: inv.info_meetings.ends_at, place: meetingPlace(inv.info_meetings), access: inv.info_meetings.rooms?.access_notes ?? null },
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
    .select("id, meeting_id, learner_id, status, learners(first_name, last_name, email), info_meetings(starts_at, ends_at, location, rooms:room_id(name, address, access_notes))")
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { AiError, aiConfigured, askStructured, type AiUsage } from "@/lib/ai/client";
import {
  absenceFollowupPrompt,
  groupBroadcastPrompt,
  learnerBriefPrompt,
  noteToActionsPrompt,
  reminderPrompt,
  seatOfferPrompt,
  type ProposedActionSchema,
} from "@/lib/ai/prompts";
import { describePattern, fmtDay } from "@/lib/reports/group-planning";
import { formatMeetingWhen } from "@/lib/admission/messages";
import { resolveProvenance } from "@/lib/admission/sources";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { learnerRef } from "@/lib/refs";
import { GOALS } from "@/lib/referentiels";
import { logContact, setAdmissionStatus, setInvitationStatus } from "@/app/(app)/apprenants/admission/actions";
import { addAbsence } from "@/app/(app)/formateurs/actions";
import { localToUtc, utcToLocalTime } from "@/lib/dates";

type Supa = Awaited<ReturnType<typeof createClient>>;
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TZ = "Europe/Paris";

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof AiError ? e.message : "Assistant indisponible, réessayez." };
}
function usageLogger(supabase: Supa, orgId: string, userId: string, feature: string) {
  return async (u: AiUsage) => {
    await supabase.from("ai_calls").insert({
      org_id: orgId, feature, model: u.model, input_tokens: u.inputTokens, output_tokens: u.outputTokens, cache_read_tokens: u.cacheReadTokens, created_by: userId,
    });
  };
}
async function senderFirstName(supabase: Supa, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  return data?.full_name?.trim().split(/\s+/)[0] ?? null;
}
const whenLabel = (startsAt: string, endsAt?: string | null) =>
  `${new Date(startsAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })} de ${utcToLocalTime(startsAt)}${endsAt ? ` à ${utcToLocalTime(endsAt)}` : ""}`;
const compose = (fr: string, translation: string | null | undefined) => (translation?.trim() ? `${fr.trim()}\n\n${translation.trim()}` : fr.trim());
const normLang = (l: string | null | undefined) => (l ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const isFrench = (l: string | null | undefined) => !normLang(l) || /^fr/.test(normLang(l)) || /francais/.test(normLang(l));

export async function assistantEnabled(): Promise<boolean> {
  return aiConfigured();
}

// ── 1. Message au groupe (annulation, report, remplacement, information) ─────────────
const broadcastSchema = z.object({
  groupId: uuid,
  kind: z.enum(["annulation", "report", "remplacement", "information"]),
  sessionId: uuid.nullable(),
  newDate: day.nullable(),
  newStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  newEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  roomId: uuid.nullable(),
  replacementTrainerId: uuid.nullable(),
  details: z.string().max(600).nullable(),
});
export type BroadcastMessage = { learnerId: string; firstName: string; phone: string | null; language: string | null; text: string };
export type BroadcastResult = { ok: true; messages: BroadcastMessage[]; fr: string; translations: { language: string; text: string }[] } | { ok: false; error: string };

export async function draftGroupBroadcast(raw: z.infer<typeof broadcastSchema>): Promise<BroadcastResult> {
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: group }, { data: session }, { data: room }, { data: trainer }, { data: enrollments }, sender] = await Promise.all([
    supabase.from("groups").select("name, rooms:room_id(name, address)").eq("id", d.groupId).single(),
    d.sessionId ? supabase.from("sessions").select("starts_at, ends_at, rooms:room_id(name)").eq("id", d.sessionId).single() : Promise.resolve({ data: null }),
    d.roomId ? supabase.from("rooms").select("name, address").eq("id", d.roomId).single() : Promise.resolve({ data: null }),
    d.replacementTrainerId ? supabase.from("v_trainers_public").select("first_name").eq("id", d.replacementTrainerId).single() : Promise.resolve({ data: null }),
    supabase.from("enrollments").select("learners(id, first_name, phone, first_language)").eq("group_id", d.groupId).eq("status", "inscrit"),
    senderFirstName(supabase, userId),
  ]);
  if (!group) return { ok: false, error: "Groupe introuvable" };
  const learners = (enrollments ?? [])
    .map((e) => e.learners as unknown as { id: string; first_name: string; phone: string | null; first_language: string | null } | null)
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  if (!learners.length) return { ok: false, error: "Aucun inscrit dans ce groupe." };

  // Une traduction par langue distincte (clé normalisée), jamais pour le français
  const langByKey = new Map<string, string>();
  for (const l of learners) if (!isFrench(l.first_language)) langByKey.set(normLang(l.first_language), l.first_language!.trim());
  const groupRoom = group.rooms as unknown as { name: string; address: string | null } | null;
  const newRoom = room as unknown as { name: string; address: string | null } | null;
  const place = newRoom ? [newRoom.name, newRoom.address].filter(Boolean).join(" — ") : d.kind === "report" ? null : groupRoom ? [groupRoom.name, groupRoom.address].filter(Boolean).join(" — ") : null;
  const sess = session as unknown as { starts_at: string; ends_at: string } | null;
  const prompt = groupBroadcastPrompt({
    kind: d.kind,
    groupName: group.name,
    sessionWhen: sess ? whenLabel(sess.starts_at, sess.ends_at) : null,
    newWhen: d.newDate ? whenLabel(localToUtc(d.newDate, d.newStart ?? "09:00"), d.newEnd ? localToUtc(d.newDate, d.newEnd) : null) : null,
    place,
    replacementTrainer: (trainer as unknown as { first_name: string } | null)?.first_name ?? null,
    details: d.details,
    senderFirstName: sender,
    languages: [...langByKey.values()],
  });
  try {
    const out = await askStructured({ ...prompt, maxTokens: 6000, onUsage: usageLogger(supabase, orgId, userId, "message_groupe") });
    const trByKey = new Map(out.translations.map((t) => [normLang(t.language), t.text]));
    const messages: BroadcastMessage[] = learners.map((l) => ({
      learnerId: l.id,
      firstName: l.first_name,
      phone: l.phone,
      language: l.first_language,
      text: compose(out.fr, isFrench(l.first_language) ? null : (trByKey.get(normLang(l.first_language)) ?? null)),
    }));
    return { ok: true, messages, fr: out.fr, translations: out.translations };
  } catch (e) {
    return fail(e);
  }
}

// ── 2. Relance d'absence personnalisée ───────────────────────────────────────────────
export type DraftResult = { ok: true; text: string; note?: string } | { ok: false; error: string };

export async function draftAbsenceFollowup(learnerId: string): Promise<DraftResult> {
  if (!uuid.safeParse(learnerId).success) return { ok: false, error: "Apprenant invalide" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const [{ data: learner }, { data: marks }, sender] = await Promise.all([
    supabase.from("learners").select("first_name, first_language").eq("id", learnerId).single(),
    supabase
      .from("attendances")
      .select("status, sessions!inner(starts_at, group_id, attendance_closed_at, groups(name))")
      .eq("learner_id", learnerId)
      .not("sessions.attendance_closed_at", "is", null),
    senderFirstName(supabase, userId),
  ]);
  if (!learner) return { ok: false, error: "Apprenant introuvable" };
  type Row = { status: string; sessions: { starts_at: string; group_id: string; groups: { name: string } | null } };
  const rows = ((marks ?? []) as unknown as Row[]).sort((a, b) => b.sessions.starts_at.localeCompare(a.sessions.starts_at));
  const last = rows[0];
  if (!last || last.status !== "absent") return { ok: false, error: "Pas d'absence récente émargée pour cette personne." };
  const sameGroup = rows.filter((r) => r.sessions.group_id === last.sessions.group_id);
  let streak = 0;
  for (const r of sameGroup) { if (r.status !== "absent") break; streak += 1; }
  const present = sameGroup.filter((r) => r.status !== "absent");
  const { data: next } = await supabase
    .from("sessions").select("starts_at, rooms:room_id(name)").eq("group_id", last.sessions.group_id).eq("status", "planifiee").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle();
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const prompt = absenceFollowupPrompt({
    firstName: learner.first_name,
    language: learner.first_language,
    groupName: last.sessions.groups?.name ?? "votre groupe",
    missedWhen: dayLabel(last.sessions.starts_at),
    streak,
    presentCount: present.length,
    totalCount: sameGroup.length,
    rate: sameGroup.length ? Math.round((present.length / sameGroup.length) * 100) : null,
    lastPresentWhen: present[0] ? dayLabel(present[0].sessions.starts_at) : null,
    nextSession: next ? `${whenLabel(next.starts_at)}${(next.rooms as unknown as { name: string } | null)?.name ? `, ${(next.rooms as unknown as { name: string }).name}` : ""}` : null,
    senderFirstName: sender,
  });
  try {
    const out = await askStructured({ ...prompt, onUsage: usageLogger(supabase, orgId, userId, "relance_absence") });
    return { ok: true, text: compose(out.fr, out.translation), note: out.tone };
  } catch (e) {
    return fail(e);
  }
}

// ── 3. Note libre → actions proposées, puis exécution de celles cochées ──────────────
export type ProposedAction = z.infer<typeof ProposedActionSchema> & { learnerId: string | null; learnerName: string | null; trainerId: string | null };
export type InterpretResult = { ok: true; summary: string; actions: ProposedAction[] } | { ok: false; error: string };

export async function interpretNote(note: string): Promise<InterpretResult> {
  const text = (note ?? "").trim();
  if (text.length < 3) return { ok: false, error: "Écrivez d'abord ce qui s'est passé." };
  if (text.length > 2000) return { ok: false, error: "Note trop longue (2000 caractères maximum)." };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const [{ data: learners }, { data: trainers }, { data: meeting }] = await Promise.all([
    supabase.from("learners").select("id, learner_no, first_name, last_name, admission_status").order("learner_no"),
    supabase.from("v_trainers_public").select("id, first_name").eq("is_active", true),
    supabase.from("info_meetings").select("id, starts_at, ends_at").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
  ]);
  const roster = (learners ?? []).map((l) => ({ ref: learnerRef(l.learner_no), firstName: l.first_name, lastName: l.last_name, status: l.admission_status ?? "nouveau" }));
  const idByRef = new Map((learners ?? []).map((l) => [learnerRef(l.learner_no), l]));
  const trainerByName = new Map((trainers ?? []).map((t) => [normLang(t.first_name), t.id]));
  const prompt = noteToActionsPrompt({
    note: text, now: new Date(), roster, trainers: (trainers ?? []).map((t) => t.first_name),
    nextMeeting: meeting ? `réunion d'information du ${formatMeetingWhen({ startsAt: meeting.starts_at, endsAt: meeting.ends_at })}` : null,
  });
  try {
    const out = await askStructured({ ...prompt, effort: "medium", maxTokens: 6000, onUsage: usageLogger(supabase, orgId, userId, "note_actions") });
    const actions: ProposedAction[] = out.actions.map((a) => {
      const l = a.learner_ref ? idByRef.get(a.learner_ref.toUpperCase()) : undefined;
      // Prénom seul dans la note : on retrouve la fiche si un seul apprenant porte ce prénom
      const trainerId = a.trainer_name ? (trainerByName.get(normLang(a.trainer_name)) ?? [...trainerByName.entries()].find(([k]) => k.startsWith(normLang(a.trainer_name!)))?.[1] ?? null) : null;
      return { ...a, learnerId: l?.id ?? null, learnerName: l ? `${l.first_name} ${l.last_name}` : null, trainerId };
    });
    return { ok: true, summary: out.summary, actions };
  } catch (e) {
    return fail(e);
  }
}

const applySchema = z.array(z.object({
  type: z.enum(["noter_contact", "changer_statut", "changer_telephone", "absence_formatrice", "confirmer_reunion", "rappel"]),
  label: z.string(),
  learnerId: uuid.nullable(),
  trainerId: uuid.nullable(),
  phone: z.string().nullable(),
  status: z.enum(["nouveau", "injoignable", "contacte", "convoque", "evalue", "liste_attente", "inscrit", "sans_suite"]).nullable(),
  outcome: z.enum(["message_envoye", "joint", "sans_reponse", "convoque", "refus", "autre"]).nullable(),
  note: z.string().nullable(),
  starts_on: day.nullable(),
  ends_on: day.nullable(),
  kind: z.enum(["conge", "maladie", "formation", "autre"]).nullable(),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  text: z.string().nullable(),
})).min(1).max(30);
export type ApplyResult = { ok: true; results: { label: string; ok: boolean; error?: string }[] } | { ok: false; error: string };

export async function applyNoteActions(raw: z.infer<typeof applySchema>): Promise<ApplyResult> {
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Actions invalides" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const results: { label: string; ok: boolean; error?: string }[] = [];
  for (const a of parsed.data) {
    try {
      let r: { ok: boolean; error?: string } = { ok: false, error: "Action incomplète" };
      if (a.type === "noter_contact" && a.learnerId) {
        r = await logContact({ learnerId: a.learnerId, channel: /whatsapp/i.test(a.note ?? "") ? "whatsapp" : "telephone", outcome: a.outcome ?? "joint", note: a.note, status: a.status });
      } else if (a.type === "changer_statut" && a.learnerId && a.status) {
        r = await setAdmissionStatus({ learnerId: a.learnerId, status: a.status });
      } else if (a.type === "changer_telephone" && a.learnerId && a.phone) {
        if (!toWhatsAppNumber(a.phone)) r = { ok: false, error: "Numéro inexploitable" };
        else {
          const { error } = await supabase.from("learners").update({ phone: a.phone.trim() }).eq("id", a.learnerId).eq("org_id", orgId);
          r = error ? { ok: false, error: translatePgError(error) } : { ok: true };
        }
      } else if (a.type === "absence_formatrice" && a.trainerId && a.starts_on) {
        r = await addAbsence({ trainerId: a.trainerId, startsOn: a.starts_on, endsOn: a.ends_on ?? a.starts_on, kind: a.kind ?? "autre", note: a.note ?? "Déclarée via l'assistant" });
      } else if (a.type === "confirmer_reunion" && a.learnerId) {
        const { data: inv } = await supabase
          .from("info_meeting_invitations").select("id, info_meetings!inner(starts_at)").eq("learner_id", a.learnerId)
          .gte("info_meetings.starts_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        r = inv ? await setInvitationStatus({ invitationId: inv.id, status: "confirmee" }) : { ok: false, error: "Pas de convocation à venir pour cette personne" };
      } else if (a.type === "rappel" && a.starts_on && a.text) {
        const { error } = await supabase.from("reminders").insert({ org_id: orgId, learner_id: a.learnerId, text: a.text, due_on: a.starts_on, due_time: a.due_time, source: "assistant", created_by: userId });
        r = error ? { ok: false, error: translatePgError(error) } : { ok: true };
      }
      results.push({ label: a.label, ok: r.ok, error: r.ok ? undefined : r.error });
    } catch (e) {
      results.push({ label: a.label, ok: false, error: e instanceof Error ? e.message : "erreur" });
    }
  }
  revalidatePath("/dashboard");
  revalidatePath("/apprenants");
  revalidatePath("/apprenants/admission");
  return { ok: true, results };
}

// ── 4. Rappels ──────────────────────────────────────────────────────────────────────
// Extraction depuis une note de contact (appelée en arrière-plan par logContact).
export async function extractReminderFromNote(input: { orgId: string; userId: string; learnerId: string; note: string }): Promise<void> {
  if (!aiConfigured()) return;
  const supabase = await createClient();
  const { data: learner } = await supabase.from("learners").select("first_name").eq("id", input.learnerId).single();
  const out = await askStructured({ ...reminderPrompt({ note: input.note, firstName: learner?.first_name ?? null, now: new Date() }), onUsage: usageLogger(supabase, input.orgId, input.userId, "rappel_note") });
  if (!out.reminder || !day.safeParse(out.reminder.due_on).success) return;
  await supabase.from("reminders").insert({
    org_id: input.orgId, learner_id: input.learnerId, text: out.reminder.text, due_on: out.reminder.due_on,
    due_time: out.reminder.due_time && /^\d{2}:\d{2}$/.test(out.reminder.due_time) ? out.reminder.due_time : null, source: "note", created_by: input.userId,
  });
  revalidatePath("/dashboard");
}

export async function completeReminder(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Rappel invalide" };
  const { userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").update({ done_at: new Date().toISOString(), done_by: userId }).eq("id", id);
  revalidatePath("/dashboard");
  return error ? { ok: false, error: translatePgError(error) } : { ok: true };
}

export async function addReminder(raw: { text: string; dueOn: string; dueTime: string | null; learnerId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.object({ text: z.string().min(2).max(300), dueOn: day, dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(), learnerId: uuid.nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Texte et date obligatoires" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").insert({ org_id: orgId, learner_id: parsed.data.learnerId, text: parsed.data.text, due_on: parsed.data.dueOn, due_time: parsed.data.dueTime, source: "manuel", created_by: userId });
  revalidatePath("/dashboard");
  return error ? { ok: false, error: translatePgError(error) } : { ok: true };
}

// ── 5. Place libérée : proposition à un candidat ─────────────────────────────────────
export async function draftSeatOffer(raw: { learnerId: string; groupId: string }): Promise<DraftResult> {
  const parsed = z.object({ learnerId: uuid, groupId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const [{ data: learner }, { data: group }, { data: next }, sender] = await Promise.all([
    supabase.from("learners").select("first_name, first_language, level_assessed").eq("id", parsed.data.learnerId).single(),
    supabase.from("groups").select("name, weekly_pattern, rooms:room_id(name, address)").eq("id", parsed.data.groupId).single(),
    supabase.from("sessions").select("starts_at").eq("group_id", parsed.data.groupId).eq("status", "planifiee").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
    senderFirstName(supabase, userId),
  ]);
  if (!learner || !group) return { ok: false, error: "Fiche ou groupe introuvable" };
  const room = group.rooms as unknown as { name: string; address: string | null } | null;
  const prompt = seatOfferPrompt({
    firstName: learner.first_name, language: learner.first_language, groupName: group.name,
    schedule: describePattern(((group.weekly_pattern as { weekday: number; start: string; end: string }[] | null) ?? []), ", ") || "à préciser",
    place: room ? [room.name, room.address].filter(Boolean).join(" — ") : null,
    firstSession: next ? whenLabel(next.starts_at) : null, level: learner.level_assessed, senderFirstName: sender,
  });
  try {
    const out = await askStructured({ ...prompt, onUsage: usageLogger(supabase, orgId, userId, "place_liberee") });
    return { ok: true, text: compose(out.fr, out.translation) };
  } catch (e) {
    return fail(e);
  }
}

// ── 6. Brief avant d'appeler ────────────────────────────────────────────────────────
export type BriefResult = { ok: true; lines: string[]; nextStep: string; watchOut: string | null } | { ok: false; error: string };

export async function learnerBrief(learnerId: string): Promise<BriefResult> {
  if (!uuid.safeParse(learnerId).success) return { ok: false, error: "Apprenant invalide" };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const [{ data: l }, { data: tests }, { data: contacts }, { data: enrollments }, { data: invitation }] = await Promise.all([
    supabase.from("learners").select("learner_no, first_name, admission_status, level_assessed, contact_source, contact_source_detail, prescriber, entry_goal, entry_need, oral_test_on, oral_test_level, oral_test_evaluator, oral_test_comment").eq("id", learnerId).single(),
    supabase.from("placement_tests").select("level, score, completed_at").eq("learner_id", learnerId).eq("status", "fait").order("created_at", { ascending: false }).limit(1),
    supabase.from("learner_contacts").select("contacted_at, channel, outcome, note").eq("learner_id", learnerId).order("contacted_at", { ascending: false }).limit(8),
    supabase.from("enrollments").select("status, groups(name)").eq("learner_id", learnerId),
    supabase.from("info_meeting_invitations").select("status, info_meetings!inner(starts_at, ends_at)").eq("learner_id", learnerId).gte("info_meetings.starts_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!l) return { ok: false, error: "Apprenant introuvable" };
  const test = tests?.[0];
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TZ });
  const meeting = invitation ? (invitation.info_meetings as unknown as { starts_at: string; ends_at: string | null }) : null;
  const prompt = learnerBriefPrompt({
    ref: learnerRef(l.learner_no), firstName: l.first_name, provenance: resolveProvenance(l).text, status: l.admission_status ?? "nouveau", level: l.level_assessed,
    writtenTest: test ? `fait le ${fmt(test.completed_at ?? "")} : ${test.level ?? "?"}${test.score != null ? ` (${Math.round(Number(test.score))}/100)` : ""}` : null,
    oralTest: l.oral_test_on ? `le ${fmtDay(l.oral_test_on, { day: "2-digit", month: "2-digit" })}${l.oral_test_evaluator ? ` par ${l.oral_test_evaluator.split(/\s+/)[0]}` : ""} : ${l.oral_test_level ?? "non déterminé"}${l.oral_test_comment ? ` — ${l.oral_test_comment}` : ""}` : null,
    need: l.entry_need, goal: GOALS.find((g) => g.code === l.entry_goal)?.label ?? null,
    contacts: (contacts ?? []).map((c) => `${fmt(c.contacted_at)} ${c.channel} · ${c.outcome}${c.note ? ` — ${c.note}` : ""}`),
    groups: (enrollments ?? []).map((e) => `${(e.groups as unknown as { name: string } | null)?.name ?? "?"} (${e.status})`),
    nextMeeting: meeting ? `${formatMeetingWhen({ startsAt: meeting.starts_at, endsAt: meeting.ends_at })} — convocation ${invitation!.status}` : null,
    now: new Date(),
  });
  try {
    const out = await askStructured({ ...prompt, onUsage: usageLogger(supabase, orgId, userId, "brief") });
    return { ok: true, lines: out.lines, nextStep: out.next_step, watchOut: out.watch_out };
  } catch (e) {
    return fail(e);
  }
}

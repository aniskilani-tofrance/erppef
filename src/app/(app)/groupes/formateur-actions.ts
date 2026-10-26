"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { translatePgError } from "@/lib/pg-errors";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { localToUtc, utcToLocalDate, weekStartOf } from "@/lib/dates";
import {
  appendTrace,
  conflictLines,
  planTrainerChange,
  seances,
  summarizePlan,
  trainerChangeTrace,
  type BusySession,
  type ChangeAssignment,
  type ChangeConflict,
  type GroupSession,
  type TrainerChangePlan,
  type TrainerChangePreview,
} from "@/lib/groupes/changer-formateur";
import { newTrainerEmail, previousTrainerEmail, type TrainerChangeEmailContext } from "@/lib/groupes/changer-formateur-emails";

// « Changer de formateur » sur la fiche du groupe (admin et coordination).
// 1. previewTrainerChange : n'écrit RIEN, calcule l'aperçu du dialogue (séances confiées,
//    séances à régler, avertissements) ;
// 2. applyTrainerChange : recalcule tout (le planning a pu bouger depuis l'aperçu), écrit
//    séance par séance (Postgres garde le dernier mot sur les chevauchements), puis le
//    groupe et sa trace, et prévient les deux personnes par email.
// Agenda Google : comme « Confier à… », la synchronisation de la nuit déplace les séances
// d'un agenda à l'autre (Paramètres → « Synchroniser maintenant » pour ne pas attendre).

const schema = z.object({
  groupId: z.string().uuid(),
  trainerId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type TrainerChangeInput = z.infer<typeof schema>;
export type PreviewResult = { ok: true; preview: TrainerChangePreview } | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; assigned: number; leftover: TrainerChangePreview["conflicts"]; message: string }
  | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Person = { id: string; first_name: string; last_name: string | null; email: string | null };
type Room = { name: string; address: string | null; access_notes: string | null };

type Loaded = {
  group: { id: string; name: string; trainer_id: string | null; co_trainer_id: string | null; notes: string | null; weekly_pattern: TrainerChangeEmailContext["pattern"] | null };
  previous: Person | null;
  room: Room | null;
  trainer: Person & { weekly_hours_max: number | null };
  sessions: GroupSession[];
  plan: TrainerChangePlan;
};

const fullName = (p: { first_name: string; last_name: string | null }) => `${p.first_name} ${p.last_name ?? ""}`.replace(/\s+/g, " ").trim();
const firstName = (p: { first_name: string }) => p.first_name.trim().split(/\s+/)[0] ?? p.first_name;

async function loadAndPlan(supabase: Supabase, orgId: string, d: TrainerChangeInput, now: Date): Promise<{ ok: true; data: Loaded } | { ok: false; error: string }> {
  if (d.effectiveFrom < utcToLocalDate(now.toISOString())) {
    return { ok: false, error: "La date d'effet ne peut pas être passée : les séances passées ne changent jamais de formateur." };
  }

  const [{ data: group, error: groupError }, { data: trainer, error: trainerError }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, status, trainer_id, co_trainer_id, notes, weekly_pattern, trainers:trainer_id(id, first_name, last_name, email), rooms:room_id(name, address, access_notes)")
      .eq("id", d.groupId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, email, is_active, weekly_hours_max")
      .eq("id", d.trainerId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  if (groupError || trainerError) return { ok: false, error: translatePgError((groupError ?? trainerError)!) };
  if (!group) return { ok: false, error: "Groupe introuvable" };
  if (group.status === "termine" || group.status === "annule") {
    return { ok: false, error: "Ce groupe est terminé ou annulé : il n'a plus de séances à confier." };
  }
  if (!trainer || trainer.is_active === false) return { ok: false, error: "Cette personne n'est pas (ou plus) active dans l'équipe." };
  if (group.trainer_id === d.trainerId) {
    return { ok: false, error: `${fullName(trainer)} est déjà la personne qui anime ce groupe. Pour une seule séance, passez par le Planning.` };
  }

  // Depuis le lundi de la semaine d'effet : le plafond d'heures se calcule semaine entière.
  const weekIso = localToUtc(weekStartOf(d.effectiveFrom), "00:00");
  const otherSessions = "id, group_id, starts_at, ends_at, groups(name)";
  const [groupSessions, asTrainer, asCoTrainer, absences, availabilities] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, attendance_closed_at, trainer_id, co_trainer_id, trainers:trainer_id(first_name, last_name)")
      .eq("group_id", d.groupId)
      .eq("org_id", orgId)
      .gte("starts_at", weekIso)
      .order("starts_at"),
    supabase.from("sessions").select(otherSessions).eq("org_id", orgId).eq("trainer_id", d.trainerId).neq("status", "annulee").gte("starts_at", weekIso),
    supabase.from("sessions").select(otherSessions).eq("org_id", orgId).eq("co_trainer_id", d.trainerId).neq("status", "annulee").gte("starts_at", weekIso),
    supabase
      .from("trainer_absences")
      .select("trainer_id, starts_on, ends_on, status")
      .eq("org_id", orgId)
      .eq("trainer_id", d.trainerId)
      .in("status", ["approuvee", "en_attente"])
      .gte("ends_on", d.effectiveFrom),
    supabase.from("trainer_availabilities").select("weekday, start_time, end_time").eq("org_id", orgId).eq("trainer_id", d.trainerId),
  ]);
  const loadError = groupSessions.error ?? asTrainer.error ?? asCoTrainer.error ?? absences.error ?? availabilities.error;
  if (loadError) return { ok: false, error: translatePgError(loadError) };

  const sessions: GroupSession[] = (groupSessions.data ?? []).map((s) => {
    const t = s.trainers as unknown as { first_name: string; last_name: string | null } | null;
    return {
      id: s.id,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status: s.status,
      attendanceClosedAt: s.attendance_closed_at,
      trainerId: s.trainer_id,
      trainerName: t ? fullName(t) : null,
      coTrainerId: s.co_trainer_id,
    };
  });
  const busy: BusySession[] = [
    ...(asTrainer.data ?? []).map((s) => ({ s, asCoTrainer: false })),
    ...(asCoTrainer.data ?? []).map((s) => ({ s, asCoTrainer: true })),
  ]
    .filter(({ s }) => s.group_id !== d.groupId)
    .map(({ s, asCoTrainer }) => ({
      id: s.id,
      groupName: (s.groups as unknown as { name: string } | null)?.name ?? "un autre groupe",
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      asCoTrainer,
    }));

  const plan = planTrainerChange({
    sessions,
    newTrainerId: d.trainerId,
    effectiveFrom: d.effectiveFrom,
    now,
    busy,
    absences: absences.data ?? [],
    weeklyHoursMax: trainer.weekly_hours_max == null ? null : Number(trainer.weekly_hours_max),
    availabilities: (availabilities.data ?? []).map((a) => ({ weekday: a.weekday, start: String(a.start_time).slice(0, 5), end: String(a.end_time).slice(0, 5) })),
  });

  const previous = (group.trainers as unknown as Person | null) ?? null;
  return {
    ok: true,
    data: {
      group: {
        id: group.id,
        name: group.name,
        trainer_id: group.trainer_id,
        co_trainer_id: group.co_trainer_id ?? null,
        notes: group.notes ?? null,
        weekly_pattern: (group.weekly_pattern as Loaded["group"]["weekly_pattern"]) ?? null,
      },
      previous: previous && previous.id !== d.trainerId ? previous : null,
      room: (group.rooms as unknown as Room | null) ?? null,
      trainer: { id: trainer.id, first_name: trainer.first_name, last_name: trainer.last_name, email: trainer.email, weekly_hours_max: trainer.weekly_hours_max },
      sessions,
      plan,
    },
  };
}

// Qui recevra un email (prénoms), qui n'a pas d'adresse sur sa fiche.
function recipients(data: Loaded): { emailTo: string[]; noEmail: string[] } {
  const people = [data.trainer, data.previous].filter((p): p is Person => Boolean(p));
  if (!mailerConfigured()) return { emailTo: [], noEmail: [] };
  return {
    emailTo: people.filter((p) => p.email?.trim()).map(firstName),
    noEmail: people.filter((p) => !p.email?.trim()).map(firstName),
  };
}

/** Aperçu du dialogue : n'écrit rien. */
export async function previewTrainerChange(raw: TrainerChangeInput): Promise<PreviewResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const loaded = await loadAndPlan(supabase, orgId, parsed.data, new Date());
  if (!loaded.ok) return loaded;
  const { data } = loaded;
  return { ok: true, preview: summarizePlan(data.plan, { trainerFirstName: firstName(data.trainer), ...recipients(data) }) };
}

/** Pose la nouvelle personne comme formatrice principale du groupe pour les séances à venir. */
export async function applyTrainerChange(raw: TrainerChangeInput): Promise<ApplyResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const d = parsed.data;
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const now = new Date();

  const loaded = await loadAndPlan(supabase, orgId, d, now);
  if (!loaded.ok) return loaded;
  const { data } = loaded;
  const { plan, trainer, previous, group } = data;

  // 1. Les séances, une par une : une séance prise entre-temps (verrou Postgres) ou
  //    modifiée depuis l'aperçu reste à régler, les autres sont confiées quand même.
  const assigned: ChangeAssignment[] = [];
  const refused: ChangeConflict[] = [];
  for (const a of plan.toAssign) {
    const { data: rows, error } = await supabase
      .from("sessions")
      .update(a.removeCoTrainer ? { trainer_id: d.trainerId, co_trainer_id: null } : { trainer_id: d.trainerId })
      .eq("id", a.sessionId)
      .eq("org_id", orgId)
      .eq("status", "planifiee")
      .is("attendance_closed_at", null)
      .select("id");
    const kept = data.sessions.find((s) => s.id === a.sessionId);
    if (error || !rows?.length) {
      refused.push({
        sessionId: a.sessionId, startsAt: a.startsAt, endsAt: a.endsAt,
        keptTrainerId: a.previousTrainerId, keptTrainerName: kept?.trainerName ?? null,
        kind: "refus_base",
        reason: error ? translatePgError(error).replace(/^Conflit : /, "") : "séance modifiée entre-temps",
      });
    } else {
      assigned.push(a);
    }
  }

  // 2. Le groupe : formateur par défaut (rattrapages, reconduction), co-animation, trace.
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const trace = trainerChangeTrace({
    at: now,
    actorName: profile?.full_name ?? null,
    fromName: previous ? fullName(previous) : null,
    toName: fullName(trainer),
    effectiveFrom: d.effectiveFrom,
  });
  const { error: groupError } = await supabase
    .from("groups")
    .update({
      trainer_id: d.trainerId,
      ...(group.co_trainer_id === d.trainerId ? { co_trainer_id: null } : {}),
      notes: appendTrace(group.notes, trace),
    })
    .eq("id", d.groupId)
    .eq("org_id", orgId);
  revalidatePath(`/groupes/${d.groupId}`);
  revalidatePath("/groupes");
  revalidatePath("/planning");
  revalidatePath("/planning/remplacements");
  revalidatePath("/dashboard");
  if (groupError) {
    return { ok: false, error: `${seances(assigned.length)} confiée${assigned.length > 1 ? "s" : ""}, mais la fiche du groupe n'a pas pu changer : ${translatePgError(groupError)}` };
  }

  // 3. Emails : la nouvelle personne, et l'ancienne s'il y en avait une.
  const leftover = [...plan.conflicts, ...refused];
  const sent: string[] = [];
  if (assigned.length && mailerConfigured()) {
    const ctx: TrainerChangeEmailContext = {
      groupName: group.name,
      effectiveFrom: d.effectiveFrom,
      pattern: group.weekly_pattern ?? [],
      room: data.room,
      assigned,
    };
    if (trainer.email?.trim()) {
      const mail = newTrainerEmail({ ...ctx, firstName: trainer.first_name, notAssigned: leftover });
      if (await sendMail({ to: trainer.email.trim(), ...mail })) sent.push(firstName(trainer));
    }
    if (previous?.email?.trim()) {
      const mail = previousTrainerEmail({
        ...ctx,
        firstName: previous.first_name,
        newTrainerName: fullName(trainer),
        kept: leftover.filter((c) => c.keptTrainerId === previous.id),
      });
      if (await sendMail({ to: previous.email.trim(), ...mail })) sent.push(firstName(previous));
    }
  }

  const who = firstName(trainer);
  const parts = [
    assigned.length
      ? `${seances(assigned.length)} confiée${assigned.length > 1 ? "s" : ""} à ${who}`
      : `${who} anime désormais le groupe (aucune séance à venir confiée)`,
  ];
  if (leftover.length) parts.push(`${leftover.length} ${leftover.length > 1 ? "restent" : "reste"} à régler dans le Planning`);
  if (sent.length) parts.push(`email envoyé à ${sent.join(" et ")}`);
  if (assigned.length) parts.push("agendas Google mis à jour cette nuit");
  return { ok: true, assigned: assigned.length, leftover: conflictLines(leftover), message: `${parts.join(" · ")}.` };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translatePgError } from "@/lib/pg-errors";
import { KIT_BUCKET, kitStoragePath, planKitShift } from "@/lib/kits";
import { CANCEL_REASONS } from "@/lib/sessions/cancellation";

export type CalendarSession = {
  id: string;
  groupId: string;
  groupName: string;
  trainerId: string | null;
  trainerName: string | null;
  coTrainerId: string | null; // co-animation (stagiaire ou second formateur)
  coTrainerName: string | null;
  roomId: string | null;
  roomName: string | null;
  funderColor: string;
  trainerColor: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
};

// Lecture des séances de la plage visible (appelée via React Query).
export async function fetchSessions(range: { from: string; to: string }): Promise<CalendarSession[]> {
  await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, group_id, trainer_id, co_trainer_id, room_id, starts_at, ends_at, status, groups(name, funders(color)), trainers:trainer_id(first_name, last_name, color), co_trainers:co_trainer_id(first_name, last_name), rooms:room_id(name)",
    )
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .neq("status", "annulee");

  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => {
    const group = s.groups as unknown as { name: string; funders: { color: string } | null } | null;
    const trainer = s.trainers as unknown as { first_name: string; last_name: string } | null;
    const coTrainer = s.co_trainers as unknown as { first_name: string; last_name: string | null } | null;
    const room = s.rooms as unknown as { name: string } | null;
    return {
      id: s.id,
      groupId: s.group_id,
      groupName: group?.name ?? "Groupe",
      trainerId: s.trainer_id,
      trainerName: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
      coTrainerId: s.co_trainer_id ?? null,
      coTrainerName: coTrainer ? `${coTrainer.first_name} ${coTrainer.last_name ?? ""}`.trim() : null,
      roomId: s.room_id,
      roomName: room?.name ?? null,
      funderColor: group?.funders?.color ?? "#64748b",
      trainerColor: (s.trainers as unknown as { color: string | null } | null)?.color ?? null,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status: s.status,
    };
  });
}

const moveSchema = z.object({
  sessionId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type MoveResult = { ok: true } | { ok: false; error: string };

// Déplacement / redimensionnement : on tente l'UPDATE, Postgres tranche les conflits (23P01).
export async function moveSession(raw: z.infer<typeof moveSchema>): Promise<MoveResult> {
  const parsed = moveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt })
    .eq("id", parsed.data.sessionId);

  if (error) return { ok: false, error: translatePgError(error) };
  return { ok: true };
}

const createSchema = z.object({
  groupId: z.string().uuid(),
  trainerId: z.string().uuid().nullable(),
  roomId: z.string().uuid().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
});

// Séance ponctuelle (rattrapage, événement isolé) créée directement depuis le planning.
// Postgres tranche les conflits (contraintes d'exclusion) comme pour le drag & drop.
export async function createSession(raw: z.infer<typeof createSchema>): Promise<MoveResult> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { error } = await supabase.from("sessions").insert({
    org_id: orgId,
    group_id: parsed.data.groupId,
    trainer_id: parsed.data.trainerId,
    room_id: parsed.data.roomId,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    generated: false,
  });

  if (error) return { ok: false, error: translatePgError(error) };
  return { ok: true };
}

const updateSchema = z.object({
  sessionId: z.string().uuid(),
  trainerId: z.string().uuid().nullable(),
  coTrainerId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable(),
});

// Édition depuis le Sheet : remplacement de formateur, changement de salle. Le statut
// n'est jamais touché ici (une séance réalisée le reste) : l'annulation passe par
// cancelSession, le retour en arrière par restoreSession.
export async function updateSession(raw: z.infer<typeof updateSchema>): Promise<MoveResult> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };

  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  if (parsed.data.coTrainerId && parsed.data.coTrainerId === parsed.data.trainerId) {
    return { ok: false, error: "Le co-animateur doit être différent du formateur." };
  }
  const { error } = await supabase
    .from("sessions")
    .update({
      trainer_id: parsed.data.trainerId,
      ...(parsed.data.coTrainerId !== undefined ? { co_trainer_id: parsed.data.coTrainerId } : {}),
      room_id: parsed.data.roomId,
    })
    .eq("id", parsed.data.sessionId);

  if (error) return { ok: false, error: translatePgError(error) };
  return { ok: true };
}

const cancelSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum(CANCEL_REASONS),
  note: z.string().max(300).optional(),
  shiftKits: z.boolean(),
});

export type CancelResult = { ok: true; message: string } | { ok: false; error: string };

// Annulation avec motif. La séance n'a pas eu lieu : si demandé, son kit glisse sur la
// séance suivante du groupe, et les kits suivants d'autant (voir planKitShift).
export async function cancelSession(raw: z.infer<typeof cancelSchema>): Promise<CancelResult> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Choisissez un motif d'annulation." };
  const { sessionId, reason, shiftKits } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  if (reason === "autre" && !note) return { ok: false, error: "Précisez le motif en une ligne." };

  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, group_id, starts_at, status")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Séance introuvable." };
  if (session.status === "annulee") return { ok: false, error: "Cette séance est déjà annulée." };
  if (session.status === "realisee") return { ok: false, error: "Cette séance a été réalisée (feuille clôturée) : elle ne peut plus être annulée." };

  const { error } = await supabase
    .from("sessions")
    .update({ status: "annulee", cancel_reason: reason, cancel_note: note, cancelled_at: new Date().toISOString(), cancelled_by: userId })
    .eq("id", sessionId);
  if (error) return { ok: false, error: translatePgError(error) };

  revalidatePath("/planning");
  revalidatePath(`/groupes/${session.group_id}`);
  if (!shiftKits) return { ok: true, message: "Séance annulée." };

  const shift = await shiftKitsAfter(orgId, session.group_id, session.id, session.starts_at);
  return { ok: true, message: `Séance annulée. ${shift}` };
}

async function shiftKitsAfter(orgId: string, groupId: string, cancelledId: string, startsAt: string): Promise<string> {
  const supabase = await createClient();
  const { data: following } = await supabase
    .from("sessions")
    .select("id")
    .eq("org_id", orgId)
    .eq("group_id", groupId)
    .eq("status", "planifiee")
    .gt("starts_at", startsAt)
    .order("starts_at");
  const ids = [cancelledId, ...(following ?? []).map((s) => s.id)];
  const { data: kits } = await supabase.from("session_kits").select("id, session_id").eq("org_id", orgId).in("session_id", ids);
  const plan = planKitShift(cancelledId, ids.slice(1), new Map((kits ?? []).map((k) => [k.session_id, k.id])));

  if (plan.kind === "none") return "Aucun kit à décaler.";
  if (plan.kind === "no-next-session") {
    return `Kits NON décalés : toutes les séances suivantes ont déjà un kit, le dernier n'aurait plus de séance. Ajoutez un rattrapage (fiche du groupe → « Replanifier automatiquement »), puis redéposez les kits.`;
  }

  // Du dernier kit au premier : la séance cible est toujours libre (un kit par séance).
  const storage = createAdminClient().storage.from(KIT_BUCKET);
  const now = new Date().toISOString();
  let done = 0;
  for (const m of plan.moves) {
    const from = kitStoragePath(orgId, m.fromSessionId);
    const to = kitStoragePath(orgId, m.toSessionId);
    await storage.remove([to]); // reste éventuel d'un dépôt interrompu
    const moved = await storage.move(from, to);
    if (moved.error) break;
    const { error } = await supabase
      .from("session_kits")
      .update({ session_id: m.toSessionId, file_path: to, shifted_from_session_id: m.fromSessionId, shifted_at: now })
      .eq("id", m.kitId);
    if (error) {
      await storage.move(to, from); // on remet le fichier à sa place : la fiche n'a pas bougé
      break;
    }
    done++;
  }
  const total = plan.moves.length;
  if (done < total) {
    return `Décalage des kits interrompu (${done}/${total}) : vérifiez les kits des prochaines séances du groupe.`;
  }
  return total === 1 ? "Son kit passe à la séance suivante." : `${total} kits décalés d'une séance.`;
}

// Erreur d'annulation : la séance redevient planifiée (motif effacé). Les kits déjà
// décalés restent où ils sont.
export async function restoreSession(sessionId: string): Promise<MoveResult> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "Séance invalide" };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("sessions")
    .update({ status: "planifiee", cancel_reason: null, cancel_note: null, cancelled_at: null, cancelled_by: null })
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .eq("status", "annulee")
    .select("group_id")
    .maybeSingle();
  if (error) return { ok: false, error: translatePgError(error) };
  if (!session) return { ok: false, error: "Cette séance n'est pas annulée." };
  revalidatePath("/planning");
  revalidatePath(`/groupes/${session.group_id}`);
  return { ok: true };
}

// Suppression DÉFINITIVE d'une séance : interdite dès qu'un émargement existe
// (registre légal d'assiduité — la cascade le détruirait). Utiliser l'annulation sinon.
export async function deleteSession(sessionId: string): Promise<MoveResult> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "Séance invalide" };
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { count } = await supabase
    .from("attendances")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Suppression impossible : ${count} émargement(s) enregistrés sur cette séance. Annulez-la plutôt — l'historique est conservé.`,
    };
  }

  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) return { ok: false, error: translatePgError(error) };
  revalidatePath("/planning");
  revalidatePath("/groupes");
  return { ok: true };
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Gestion des feuilles d'émargement côté équipe. La RLS de `sessions` n'autorise pas
// l'écriture aux formateurs : on passe par le client service_role, toujours après
// requireRole() et avec filtre org_id explicite sur chaque requête.

export type ActionResult = { ok: true } | { ok: false; error: string };

const ROLES = ["admin", "coordinator", "trainer"] as const;

export async function openAttendanceSheet(sessionId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "Séance invalide" };

  const { orgId } = await requireRole([...ROLES]);
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, attendance_token, attendance_closed_at")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .single();
  if (!session) return { ok: false, error: "Séance introuvable" };
  if (session.attendance_closed_at) return { ok: false, error: "Feuille déjà clôturée" };
  if (session.attendance_token) return { ok: true }; // déjà ouverte : idempotent

  const { error } = await supabase
    .from("sessions")
    .update({ attendance_token: randomUUID(), attendance_opened_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/seances/${sessionId}/emargement`);
  return { ok: true };
}

const statusSchema = z.object({
  sessionId: z.string().uuid(),
  learnerId: z.string().uuid(),
  status: z.enum(["present", "retard", "absent"]),
});

// Statut posé à la main par le formateur. « Absent » efface une éventuelle signature
// (choix explicite) ; « présent »/« retard » la conservent.
export async function setAttendanceStatus(raw: z.infer<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const d = parsed.data;

  const { orgId } = await requireRole([...ROLES]);
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, attendance_closed_at")
    .eq("id", d.sessionId)
    .eq("org_id", orgId)
    .single();
  if (!session) return { ok: false, error: "Séance introuvable" };
  if (session.attendance_closed_at) return { ok: false, error: "Feuille clôturée : rouvrez-la pour corriger" };

  const { data: existing } = await supabase
    .from("attendances")
    .select("id")
    .eq("session_id", d.sessionId)
    .eq("learner_id", d.learnerId)
    .maybeSingle();

  const wipeSignature = d.status === "absent" ? { signature: null, signed_at: null, method: "manuel" } : {};
  const { error } = existing
    ? await supabase.from("attendances").update({ status: d.status, ...wipeSignature }).eq("id", existing.id)
    : await supabase.from("attendances").insert({
        org_id: orgId,
        session_id: d.sessionId,
        learner_id: d.learnerId,
        status: d.status,
        method: "manuel",
      });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/seances/${d.sessionId}/emargement`);
  return { ok: true };
}

const closeSchema = z.object({
  sessionId: z.string().uuid(),
  trainerSignature: z.string().startsWith("data:image/png;base64,").max(200_000),
});

// Clôture : les inscrits sans ligne d'émargement deviennent absents, la contre-signature
// du formateur est enregistrée et le token public est révoqué.
export async function closeAttendanceSheet(raw: z.infer<typeof closeSchema>): Promise<ActionResult> {
  const parsed = closeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Signature du formateur requise" };
  const d = parsed.data;

  const { orgId } = await requireRole([...ROLES]);
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, group_id, attendance_closed_at")
    .eq("id", d.sessionId)
    .eq("org_id", orgId)
    .single();
  if (!session) return { ok: false, error: "Séance introuvable" };
  if (session.attendance_closed_at) return { ok: false, error: "Feuille déjà clôturée" };

  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase.from("enrollments").select("learner_id").eq("group_id", session.group_id).eq("status", "inscrit"),
    supabase.from("attendances").select("learner_id").eq("session_id", d.sessionId),
  ]);
  const marked = new Set((attendances ?? []).map((a) => a.learner_id));
  const missing = (enrollments ?? []).filter((e) => !marked.has(e.learner_id));

  if (missing.length > 0) {
    const { error } = await supabase.from("attendances").insert(
      missing.map((e) => ({
        org_id: orgId,
        session_id: d.sessionId,
        learner_id: e.learner_id,
        status: "absent" as const,
        method: "manuel" as const,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      attendance_closed_at: new Date().toISOString(),
      trainer_signature: d.trainerSignature,
      attendance_token: null,
    })
    .eq("id", d.sessionId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/seances/${d.sessionId}/emargement`);
  return { ok: true };
}

// Réouverture en cas d'erreur : réservée à l'équipe de coordination, nouveau token.
export async function reopenAttendanceSheet(sessionId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "Séance invalide" };

  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("sessions")
    .update({
      attendance_closed_at: null,
      trainer_signature: null,
      attendance_token: randomUUID(),
      attendance_opened_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/seances/${sessionId}/emargement`);
  return { ok: true };
}

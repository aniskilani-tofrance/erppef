"use server";

import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  KIT_BUCKET, KIT_LINK_SECONDS, KIT_MAX_BYTES, canDownloadKit, canManageKits, kitDownloadName, kitStoragePath, parseKitFileName,
} from "@/lib/kits";

// Kits de séance (PDF) : dépôt par la coordination, téléchargement par le formateur de la
// séance. Le bucket « kits » n'a aucune policy client : toutes les URL sont signées ici,
// après contrôle du rôle ET de l'affectation à la séance.

export type SessionKitInfo = {
  kit: {
    fileName: string; sizeBytes: number | null; updatedAt: string; level: string | null; sequenceNo: number | null; seanceNo: number | null;
    shiftedFrom: string | null; // début de la séance annulée d'où vient le kit (décalage)
  } | null;
  canDownload: boolean;
  canManage: boolean;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const sessionIdSchema = z.string().uuid();

async function loadContext(sessionId: string) {
  const { orgId, userId, role } = await requireSession();
  const supabase = await createClient();
  const [{ data: session }, { data: membership }] = await Promise.all([
    supabase.from("sessions").select("id, org_id, trainer_id, co_trainer_id").eq("id", sessionId).maybeSingle(),
    supabase.from("memberships").select("trainer_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (!session || session.org_id !== orgId) return null;
  const allowed = canDownloadKit({
    role,
    myTrainerId: membership?.trainer_id ?? null,
    session: { trainerId: session.trainer_id, coTrainerId: session.co_trainer_id },
  });
  return { orgId, userId, role, supabase, allowed };
}

/** Kit de la séance, s'il existe et si l'utilisateur y a droit (la RLS filtre aussi). */
export async function getSessionKit(sessionId: string): Promise<SessionKitInfo> {
  const id = sessionIdSchema.parse(sessionId);
  const ctx = await loadContext(id);
  if (!ctx || !ctx.allowed) return { kit: null, canDownload: false, canManage: false };
  const { data } = await ctx.supabase
    .from("session_kits")
    .select("file_name, size_bytes, updated_at, level, sequence_no, seance_no, shifted_from:shifted_from_session_id(starts_at)")
    .eq("session_id", id)
    .maybeSingle();
  const shiftedFrom = (data?.shifted_from as unknown as { starts_at: string } | null)?.starts_at ?? null;
  return {
    kit: data
      ? { fileName: data.file_name, sizeBytes: data.size_bytes, updatedAt: data.updated_at, level: data.level, sequenceNo: data.sequence_no, seanceNo: data.seance_no, shiftedFrom }
      : null,
    canDownload: Boolean(data),
    canManage: canManageKits(ctx.role),
  };
}

/** Lien de téléchargement signé, valable 5 minutes. */
export async function getKitDownloadUrl(sessionId: string): Promise<Result<{ url: string }>> {
  const id = sessionIdSchema.parse(sessionId);
  const ctx = await loadContext(id);
  if (!ctx || !ctx.allowed) return { ok: false, error: "Ce kit est réservé au formateur de la séance." };
  // Lecture par le client de l'utilisateur : la RLS confirme le droit avant de signer.
  const { data: kit } = await ctx.supabase.from("session_kits").select("file_path, file_name").eq("session_id", id).maybeSingle();
  if (!kit) return { ok: false, error: "Aucun kit déposé pour cette séance." };
  const { data, error } = await createAdminClient()
    .storage.from(KIT_BUCKET)
    .createSignedUrl(kit.file_path, KIT_LINK_SECONDS, { download: kitDownloadName(kit.file_name) });
  if (error || !data) return { ok: false, error: "Le lien de téléchargement n'a pas pu être créé." };
  return { ok: true, url: data.signedUrl };
}

const uploadSchema = z.object({
  sessionId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(KIT_MAX_BYTES),
});

/** Étape 1 du dépôt : URL d'envoi signée (le PDF part du navigateur vers le stockage, sans passer par le serveur). */
export async function createKitUploadUrl(raw: z.infer<typeof uploadSchema>): Promise<Result<{ path: string; token: string }>> {
  const input = uploadSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "Fichier refusé : un PDF de 30 Mo maximum." };
  if (!/\.pdf$/i.test(input.data.fileName)) return { ok: false, error: "Le kit doit être un fichier PDF." };
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: session } = await supabase.from("sessions").select("id").eq("id", input.data.sessionId).eq("org_id", orgId).maybeSingle();
  if (!session) return { ok: false, error: "Séance introuvable." };
  const path = kitStoragePath(orgId, session.id);
  const { data, error } = await createAdminClient().storage.from(KIT_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { ok: false, error: "L'envoi n'a pas pu être préparé." };
  return { ok: true, path, token: data.token };
}

/** Étape 2 du dépôt : enregistre le kit une fois le PDF envoyé (remplace le précédent). */
export async function confirmKitUpload(raw: z.infer<typeof uploadSchema>): Promise<Result<object>> {
  const input = uploadSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "Dépôt invalide." };
  const { orgId, userId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const path = kitStoragePath(orgId, input.data.sessionId);
  // Le fichier doit vraiment être arrivé dans le stockage.
  const { data: listed } = await createAdminClient().storage.from(KIT_BUCKET).list(orgId, { search: `${input.data.sessionId}.pdf` });
  if (!listed?.some((f) => f.name === `${input.data.sessionId}.pdf`)) return { ok: false, error: "Le PDF n'est pas arrivé, réessayez." };
  const parsed = parseKitFileName(input.data.fileName);
  const { error } = await supabase.from("session_kits").upsert(
    {
      org_id: orgId,
      session_id: input.data.sessionId,
      file_path: path,
      file_name: input.data.fileName,
      size_bytes: input.data.sizeBytes,
      level: parsed?.level ?? null,
      sequence_no: parsed?.sequenceNo ?? null,
      seance_no: parsed?.seanceNo ?? null,
      shifted_from_session_id: null,
      shifted_at: null,
      uploaded_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (error) return { ok: false, error: "Le kit n'a pas pu être enregistré." };
  return { ok: true };
}

export async function deleteSessionKit(sessionId: string): Promise<Result<object>> {
  const id = sessionIdSchema.parse(sessionId);
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const { data: kit } = await supabase.from("session_kits").select("id, file_path").eq("session_id", id).eq("org_id", orgId).maybeSingle();
  if (!kit) return { ok: true };
  const { error } = await supabase.from("session_kits").delete().eq("id", kit.id);
  if (error) return { ok: false, error: "Le kit n'a pas pu être supprimé." };
  await createAdminClient().storage.from(KIT_BUCKET).remove([kit.file_path]);
  return { ok: true };
}

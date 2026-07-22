"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Page PUBLIQUE : aucune session Supabase. Le token d'émargement est le secret ;
// chaque action le revalide avant de toucher la base (client service_role).

export type SheetLearner = {
  id: string;
  name: string;
  signedAt: string | null;
};

export type Sheet = {
  sessionId: string;
  groupName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  learners: SheetLearner[];
};

const uuid = z.string().uuid();

// Séance ouverte à l'émargement pour ce token, dans la fenêtre de validité
// (jusqu'à 24 h après la fin : couvre les retards sans laisser traîner le lien).
async function findOpenSession(token: string) {
  if (!uuid.safeParse(token).success) return null;
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, org_id, group_id, starts_at, ends_at, attendance_closed_at, groups(name)")
    .eq("attendance_token", token)
    .single();

  if (!session || session.attendance_closed_at) return null;
  if (Date.now() > new Date(session.ends_at).getTime() + 24 * 3600 * 1000) return null;
  return session;
}

export async function fetchSheet(token: string): Promise<Sheet | null> {
  const session = await findOpenSession(token);
  if (!session) return null;
  const supabase = createAdminClient();

  const [{ data: enrollments }, { data: attendances }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("learner_id, learners(first_name, last_name)")
      .eq("group_id", session.group_id)
      .eq("status", "inscrit"),
    supabase
      .from("attendances")
      .select("learner_id, signed_at")
      .eq("session_id", session.id)
      .not("signed_at", "is", null),
  ]);

  const signedAt = new Map((attendances ?? []).map((a) => [a.learner_id, a.signed_at as string]));

  const learners: SheetLearner[] = (enrollments ?? [])
    .map((e) => {
      const l = e.learners as unknown as { first_name: string; last_name: string } | null;
      return {
        id: e.learner_id,
        name: l ? `${l.first_name} ${l.last_name}` : "—",
        signedAt: signedAt.get(e.learner_id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const group = session.groups as unknown as { name: string } | null;
  return {
    sessionId: session.id,
    groupName: group?.name ?? "Groupe",
    date: session.starts_at,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    learners,
  };
}

const signSchema = z.object({
  token: z.string().uuid(),
  learnerId: z.string().uuid(),
  signature: z.string().startsWith("data:image/png;base64,").max(200_000),
});

export type SignResult = { ok: true } | { ok: false; error: string };

export async function signAttendance(raw: z.infer<typeof signSchema>): Promise<SignResult> {
  const parsed = signSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Signature invalide." };
  const { token, learnerId, signature } = parsed.data;

  const session = await findOpenSession(token);
  if (!session) return { ok: false, error: "Émargement clôturé ou lien expiré." };
  const supabase = createAdminClient();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("group_id", session.group_id)
    .eq("learner_id", learnerId)
    .eq("status", "inscrit")
    .maybeSingle();
  if (!enrollment) return { ok: false, error: "Apprenant non inscrit à ce groupe." };

  const { data: existing } = await supabase
    .from("attendances")
    .select("id, signed_at")
    .eq("session_id", session.id)
    .eq("learner_id", learnerId)
    .maybeSingle();
  if (existing?.signed_at) return { ok: false, error: "Déjà signé pour cette séance." };

  const device = (await headers()).get("user-agent")?.slice(0, 255) ?? null;
  const row = {
    org_id: session.org_id,
    session_id: session.id,
    learner_id: learnerId,
    status: "present" as const,
    signature,
    signed_at: new Date().toISOString(),
    method: "tablette" as const,
    device,
  };

  // Un statut posé à la main par le formateur (ex. « retard ») peut préexister : on le remplace par la signature.
  const { error } = existing
    ? await supabase.from("attendances").update(row).eq("id", existing.id)
    : await supabase.from("attendances").insert(row);

  if (error) return { ok: false, error: "Enregistrement impossible, réessayez." };
  revalidatePath(`/emargement/${token}`);
  return { ok: true };
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttendanceManager } from "@/components/emargement/attendance-manager";
import { utcToLocalTime } from "@/lib/dates";
import { SessionLogCard } from "@/components/emargement/session-log-card";
import { formatLogDay, loadSessionLogContext } from "@/lib/seances/cahier";
import { excuseTraceLabel } from "@/lib/emargement/excuse";
import type { AttendanceStatus } from "@/lib/attendance-status";

type SheetAttendance = {
  learner_id: string;
  status: AttendanceStatus;
  signed_at: string | null;
  signature: string | null;
  excuse_reason: string | null;
  excused_at: string | null;
  excuser: { full_name: string | null } | null;
};

// Émargements de la feuille, avec le motif et la trace des absences excusées. Tolérant :
// tant que la migration 0055 n'est pas appliquée (colonnes excuse_* absentes), on relit
// sans elles et la page s'affiche comme avant (« Excusé » répondra « indisponible »).
async function loadSheetAttendances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<{ rows: SheetAttendance[]; excuseAvailable: boolean }> {
  const full = await supabase
    .from("attendances")
    .select("learner_id, status, signed_at, signature, excuse_reason, excused_at, excuser:excused_by(full_name)")
    .eq("session_id", sessionId);
  if (!full.error) return { rows: (full.data ?? []) as unknown as SheetAttendance[], excuseAvailable: true };
  // Nom de l'auteur illisible (cache du schéma pas encore rechargé) : motif et date suffisent
  const noName = await supabase
    .from("attendances")
    .select("learner_id, status, signed_at, signature, excuse_reason, excused_at")
    .eq("session_id", sessionId);
  if (!noName.error) {
    return { rows: ((noName.data ?? []) as unknown as SheetAttendance[]).map((r) => ({ ...r, excuser: null })), excuseAvailable: true };
  }
  const basic = await supabase.from("attendances").select("learner_id, status, signed_at, signature").eq("session_id", sessionId);
  return {
    rows: ((basic.data ?? []) as unknown as SheetAttendance[]).map((r) => ({ ...r, excuse_reason: null, excused_at: null, excuser: null })),
    excuseAvailable: false,
  };
}

export default async function EmargementSeancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, userId, orgId } = await requireRole(["admin", "coordinator", "trainer", "stagiaire"]);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, group_id, trainer_id, co_trainer_id, starts_at, ends_at, status, attendance_token, attendance_opened_at, attendance_closed_at, trainer_signature, groups(name), trainers:trainer_id(first_name, last_name), rooms:room_id(name)",
    )
    .eq("id", id)
    .single();
  if (!session) notFound();

  const [{ data: enrollments }, { rows: attendances, excuseAvailable }, logContext, { data: membership }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("learner_id, learners(first_name, last_name)")
      .eq("group_id", session.group_id)
      .eq("status", "inscrit"),
    loadSheetAttendances(supabase, id),
    loadSessionLogContext(supabase, { id: session.id, groupId: session.group_id, startsAt: session.starts_at }),
    supabase.from("memberships").select("trainer_id").eq("user_id", userId).eq("org_id", orgId).maybeSingle(),
  ]);
  // Cahier : la coordination partout, une formatrice sur les séances qu'elle anime ou co-anime,
  // un stagiaire sur les séances de ses groupes (la RLS ne lui montre que celles-là)
  const myTrainerId = membership?.trainer_id ?? null;
  const canEditLog =
    role !== "trainer" || (myTrainerId !== null && [session.trainer_id, session.co_trainer_id].includes(myTrainerId));

  const byLearner = new Map(attendances.map((a) => [a.learner_id, a]));
  const learners = (enrollments ?? [])
    .map((e) => {
      const l = e.learners as unknown as { first_name: string; last_name: string } | null;
      const a = byLearner.get(e.learner_id);
      return {
        id: e.learner_id,
        name: l ? `${l.first_name} ${l.last_name}` : "—",
        status: a?.status ?? null,
        signedAt: a?.signed_at ?? null,
        hasSignature: Boolean(a?.signature),
        excuseReason: a?.status === "excuse" ? a.excuse_reason : null,
        excuseTrace: a?.status === "excuse" ? excuseTraceLabel(a.excused_at, a.excuser?.full_name ?? null) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // URL publique de la tablette, reconstruite depuis la requête (fonctionne en local et sur Vercel).
  let publicUrl: string | null = null;
  let qrDataUrl: string | null = null;
  if (session.attendance_token && !session.attendance_closed_at) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    publicUrl = `${proto}://${h.get("host")}/emargement/${session.attendance_token}`;
    qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 280, margin: 1 });
  }

  const group = session.groups as unknown as { name: string } | null;
  const trainer = session.trainers as unknown as { first_name: string; last_name: string } | null;
  const room = session.rooms as unknown as { name: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Émargement</h1>
        <Link href={`/groupes/${session.group_id}`} className="ml-auto text-sm text-muted-foreground hover:underline">
          ← Fiche du groupe
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{group?.name}</span>
        {" · "}
        {new Date(session.starts_at).toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
          timeZone: "Europe/Paris",
        })}
        {" · "}
        {utcToLocalTime(session.starts_at)} – {utcToLocalTime(session.ends_at)}
        {trainer && ` · ${trainer.first_name} ${trainer.last_name ?? ""}`.trim()}
        {room && ` · ${room.name}`}
      </p>

      <AttendanceManager
        sessionId={session.id}
        learners={learners}
        isOpen={Boolean(session.attendance_token) && !session.attendance_closed_at}
        closedAt={session.attendance_closed_at}
        trainerSignature={session.trainer_signature}
        canReopen={role === "admin" || role === "coordinator"}
        canExcuseClosed={role === "admin" || role === "coordinator"}
        excuseAvailable={excuseAvailable}
        publicUrl={publicUrl}
        qrDataUrl={qrDataUrl}
      />

      <SessionLogCard
        sessionId={session.id}
        available={logContext.available}
        current={logContext.current}
        previous={logContext.previous ? { ...logContext.previous, dayLabel: formatLogDay(logContext.previous.startsAt) } : null}
        canEdit={canEditLog}
      />
    </div>
  );
}

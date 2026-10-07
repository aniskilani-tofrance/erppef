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

export default async function EmargementSeancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, userId, orgId } = await requireRole(["admin", "coordinator", "trainer"]);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, group_id, trainer_id, co_trainer_id, starts_at, ends_at, status, attendance_token, attendance_opened_at, attendance_closed_at, trainer_signature, groups(name), trainers:trainer_id(first_name, last_name), rooms:room_id(name)",
    )
    .eq("id", id)
    .single();
  if (!session) notFound();

  const [{ data: enrollments }, { data: attendances }, logContext, { data: membership }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("learner_id, learners(first_name, last_name)")
      .eq("group_id", session.group_id)
      .eq("status", "inscrit"),
    supabase
      .from("attendances")
      .select("learner_id, status, signed_at, signature")
      .eq("session_id", id),
    loadSessionLogContext(supabase, { id: session.id, groupId: session.group_id, startsAt: session.starts_at }),
    supabase.from("memberships").select("trainer_id").eq("user_id", userId).eq("org_id", orgId).maybeSingle(),
  ]);
  // Cahier : la coordination partout, une formatrice sur les séances qu'elle anime ou co-anime
  const myTrainerId = membership?.trainer_id ?? null;
  const canEditLog =
    role !== "trainer" || (myTrainerId !== null && [session.trainer_id, session.co_trainer_id].includes(myTrainerId));

  const byLearner = new Map((attendances ?? []).map((a) => [a.learner_id, a]));
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

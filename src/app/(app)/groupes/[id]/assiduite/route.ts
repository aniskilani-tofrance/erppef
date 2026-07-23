import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeLearnerStats,
  sessionHours,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Export CSV de l'assiduité d'un groupe (récapitulatif par apprenant, pour les
// financeurs). Séparateur « ; » et BOM UTF-8 : ouverture directe dans Excel FR.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: group }, { data: enrollments }, { data: rows }] = await Promise.all([
    supabase.from("groups").select("name").eq("id", id).single(),
    supabase
      .from("enrollments")
      .select("learner_id, learners(first_name, last_name)")
      .eq("group_id", id)
      .eq("status", "inscrit"),
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(starts_at, ends_at, attendance_closed_at, group_id)")
      .eq("sessions.group_id", id)
      .not("sessions.attendance_closed_at", "is", null),
  ]);
  if (!group) return new Response("Groupe introuvable", { status: 404 });

  const records: AttendanceRecord[] = (rows ?? []).map((a) => {
    const s = a.sessions as unknown as { starts_at: string; ends_at: string };
    return {
      learnerId: a.learner_id,
      status: a.status as AttendanceRecord["status"],
      startsAt: s.starts_at,
      hours: sessionHours(s.starts_at, s.ends_at),
    };
  });
  const stats = computeLearnerStats(records);

  const fmt = (n: number) => n.toFixed(1).replace(".", ",");
  const lines = [
    `Groupe;${group.name}`,
    `Export du;${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`,
    "",
    "Apprenant;Séances émargées;Présences;Retards;Absences;Taux de présence;Heures suivies",
  ];
  for (const e of enrollments ?? []) {
    const l = e.learners as unknown as { first_name: string; last_name: string } | null;
    const name = l ? `${l.first_name} ${l.last_name}` : "—";
    const st = stats.get(e.learner_id);
    lines.push(
      st
        ? `${name};${st.total};${st.attended - st.late};${st.late};${st.absent};${st.rate} %;${fmt(st.hoursAttended)}`
        : `${name};0;0;0;0;—;0`,
    );
  }

  const csv = "\uFEFF" + lines.join("\r\n");
  const slug = group.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="assiduite_${slug}.csv"`,
    },
  });
}

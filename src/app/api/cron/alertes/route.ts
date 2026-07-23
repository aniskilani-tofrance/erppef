import { createAdminClient } from "@/lib/supabase/admin";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Cron du matin : email récapitulatif au coordinateur si quelque chose mérite action —
// apprenants en risque de décrochage, feuilles d'émargement de la veille non clôturées.
// Envoi via Resend (RESEND_API_KEY + ALERTS_EMAIL) ; sans configuration, la route
// répond avec les alertes calculées sans envoyer (elles restent visibles dans l'app).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const [{ data: attendanceRows }, { data: unclosed }, { data: learners }] = await Promise.all([
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(starts_at, attendance_closed_at)")
      .not("sessions.attendance_closed_at", "is", null),
    supabase
      .from("sessions")
      .select("id, starts_at, groups(name), trainers:trainer_id(first_name)")
      .neq("status", "annulee")
      .is("attendance_closed_at", null)
      .gte("starts_at", new Date(now.getTime() - 48 * 3600_000).toISOString())
      .lt("ends_at", now.toISOString())
      .order("starts_at"),
    supabase.from("learners").select("id, first_name, last_name"),
  ]);

  const stats = computeLearnerStats(
    (attendanceRows ?? []).map((a) => ({
      learnerId: a.learner_id,
      status: a.status as AttendanceRecord["status"],
      startsAt: (a.sessions as unknown as { starts_at: string }).starts_at,
    })),
  );
  const nameById = new Map((learners ?? []).map((l) => [l.id, `${l.first_name} ${l.last_name}`]));
  const atRisk = [...stats.entries()]
    .filter(([, s]) => s.consecutiveAbsences >= ABSENCE_ALERT_THRESHOLD)
    .map(([id, s]) => `${nameById.get(id) ?? "?"} — ${s.consecutiveAbsences} absences de suite`);

  const sheets = (unclosed ?? []).map((s) => {
    const day = new Date(s.starts_at).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
    });
    const group = (s.groups as unknown as { name: string } | null)?.name ?? "?";
    const trainer = (s.trainers as unknown as { first_name: string } | null)?.first_name;
    return `${group} (${day}${trainer ? `, ${trainer}` : ""})`;
  });

  if (atRisk.length === 0 && sheets.length === 0) {
    return Response.json({ sent: false, reason: "rien à signaler" });
  }

  const lines = [
    ...(atRisk.length ? ["⚠️ Risque de décrochage :", ...atRisk.map((l) => `  • ${l}`), ""] : []),
    ...(sheets.length ? ["📋 Feuilles d'émargement non clôturées :", ...sheets.map((l) => `  • ${l}`), ""] : []),
    "Détails : https://pef-erp.vercel.app/qualite",
  ];

  if (!process.env.RESEND_API_KEY || !process.env.ALERTS_EMAIL) {
    return Response.json({ sent: false, reason: "email non configuré", alerts: lines });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERTS_FROM ?? "ERP PEF <onboarding@resend.dev>",
      to: [process.env.ALERTS_EMAIL],
      subject: `ERP PEF — ${atRisk.length + sheets.length} alerte${atRisk.length + sheets.length > 1 ? "s" : ""} ce matin`,
      text: lines.join("\n"),
    }),
  });

  if (!res.ok) {
    return Response.json({ sent: false, error: await res.text() }, { status: 500 });
  }
  return Response.json({ sent: true, atRisk: atRisk.length, unclosedSheets: sheets.length });
}

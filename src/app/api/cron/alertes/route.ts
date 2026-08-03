import { gzipSync } from "node:zlib";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveConfigured, uploadBufferToDrive } from "@/lib/emargement/gdrive";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Sauvegarde logique hebdomadaire de la base (registre légal d'assiduité) vers le
// Drive partagé, dossier « Sauvegardes » : un JSON gzippé par semaine, écrasé si relancé.
const BACKUP_TABLES = [
  "organizations", "funders", "programs", "trainers", "trainer_availabilities",
  "trainer_absences", "trainer_documents", "rooms", "room_unavailabilities",
  "groups", "sessions", "learners", "enrollments", "attendances",
  "survey_responses", "complaints", "memberships", "profiles", "calendar_closures",
] as const;

async function runWeeklyBackup(): Promise<string> {
  const supabase = createAdminClient();
  const dump: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    // Pagination : les signatures d'émargement rendent `attendances` volumineuse.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    dump[table] = rows;
  }
  const day = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const payload = gzipSync(Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), tables: dump })));
  await uploadBufferToDrive({
    folderName: "Sauvegardes",
    fileName: `sauvegarde_erp_${day}.json.gz`,
    data: payload,
    mimeType: "application/gzip",
  });
  return `${Math.round(payload.length / 1024)} Ko`;
}

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

  // Dimanche : sauvegarde hebdomadaire avant les alertes (jamais bloquante).
  let backup: string | null = null;
  if (now.getUTCDay() === 0 && driveConfigured()) {
    try {
      backup = await runWeeklyBackup();
    } catch (e) {
      backup = `échec : ${e instanceof Error ? e.message : "erreur"}`;
    }
  }

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
    return Response.json({ sent: false, reason: "rien à signaler", backup });
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

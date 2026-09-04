import { gzipSync } from "node:zlib";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveConfigured, uploadBufferToDrive } from "@/lib/emargement/gdrive";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { localToUtc, nextDay, utcToLocalTime } from "@/lib/dates";
import { buildMeetingReminderMessage, formatMeetingWhen, textToHtml } from "@/lib/admission/messages";
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
      .select("id, starts_at, groups(name), trainers:trainer_id(first_name, email)")
      .neq("status", "annulee")
      .is("attendance_closed_at", null)
      .gte("starts_at", new Date(now.getTime() - 48 * 3600_000).toISOString())
      .lt("ends_at", now.toISOString())
      .order("starts_at"),
    supabase.from("learners").select("id, first_name, last_name"),
  ]);

  // Rappels apprenants (séances de demain, groupes ayant activé les rappels)
  // + relance des formateurs sur leurs feuilles non clôturées. Jamais bloquant.
  let reminders: { sent: number; skippedNoEmail: number } = { sent: 0, skippedNoEmail: 0 };
  let meetingReminders: { sent: number; skippedNoEmail: number } = { sent: 0, skippedNoEmail: 0 };
  let trainerRelances = 0;
  if (mailerConfigured()) {
    try {
      reminders = await sendSessionReminders(supabase);
    } catch (e) {
      console.error("[rappels]", e instanceof Error ? e.message : e);
    }
    try {
      meetingReminders = await sendMeetingReminders(supabase);
    } catch (e) {
      console.error("[rappels réunion]", e instanceof Error ? e.message : e);
    }
    try {
      trainerRelances = await sendTrainerRelances(unclosed ?? []);
    } catch (e) {
      console.error("[relances]", e instanceof Error ? e.message : e);
    }
  }

  // Le 1er du mois : la veille Qualiopi (critère 6) du mois écoulé a-t-elle été tenue ?
  // L'auditeur juge la régularité — une entrée par mois est le minimum visé.
  let watchReminder: string | null = null;
  const paris = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // YYYY-MM-DD
  if (paris.slice(8, 10) === "01") {
    const { data: org } = await supabase.from("organizations").select("id").eq("slug", "pef").single();
    if (org) {
      const monthStart = `${paris.slice(0, 7)}-01`;
      const prev = new Date(`${monthStart}T12:00:00Z`);
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      const prevStart = prev.toISOString().slice(0, 8) + "01";
      const { count } = await supabase
        .from("watch_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .gte("entry_date", prevStart)
        .lt("entry_date", monthStart);
      if (!count) {
        watchReminder =
          "📚 Veille Qualiopi (critère 6) : aucune entrée le mois dernier — ajoutez une entrée dans Qualité → Registre de veille (une source lue + 2 lignes suffisent).";
      }
    }
  }

  // Parcours d'admission : nouveaux jamais contactés (> 3 jours), convocations non
  // envoyées pour une réunion sous 7 jours, réunion demain. Jamais bloquant.
  const admissionLines = await admissionAlerts(supabase).catch((e) => {
    console.error("[admission]", e instanceof Error ? e.message : e);
    return [] as string[];
  });

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

  if (atRisk.length === 0 && sheets.length === 0 && !watchReminder && admissionLines.length === 0) {
    return Response.json({ sent: false, reason: "rien à signaler", backup, reminders, meetingReminders, trainerRelances });
  }

  const lines = [
    ...(atRisk.length ? ["⚠️ Risque de décrochage :", ...atRisk.map((l) => `  • ${l}`), ""] : []),
    ...(sheets.length ? ["📋 Feuilles d'émargement non clôturées :", ...sheets.map((l) => `  • ${l}`), ""] : []),
    ...(admissionLines.length ? ["🤝 Admission :", ...admissionLines.map((l) => `  • ${l}`), ""] : []),
    ...(watchReminder ? [watchReminder, ""] : []),
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
      subject: `ERP PEF — ${atRisk.length + sheets.length + admissionLines.length} alerte${atRisk.length + sheets.length + admissionLines.length > 1 ? "s" : ""} ce matin`,
      text: lines.join("\n"),
    }),
  });

  if (!res.ok) {
    return Response.json({ sent: false, error: await res.text() }, { status: 500 });
  }
  return Response.json({ sent: true, atRisk: atRisk.length, unclosedSheets: sheets.length, admission: admissionLines.length, reminders, meetingReminders, trainerRelances });
}

// ── Parcours d'admission : alertes du matin ──────────────────────────────────
async function admissionAlerts(supabase: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const lines: string[] = [];
  const now = Date.now();

  const { count: neverContacted } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .eq("admission_status", "nouveau")
    .lt("created_at", new Date(now - 3 * 86_400_000).toISOString());
  if (neverContacted) {
    lines.push(`${neverContacted} nouvel${neverContacted > 1 ? "s" : ""} apprenant${neverContacted > 1 ? "s" : ""} jamais contacté${neverContacted > 1 ? "s" : ""} depuis plus de 3 jours — https://pef-erp.vercel.app/admission`);
  }

  const { data: meetings } = await supabase
    .from("info_meetings")
    .select("id, starts_at, info_meeting_invitations(status)")
    .gte("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + 7 * 86_400_000).toISOString())
    .order("starts_at");
  for (const m of meetings ?? []) {
    const st = (m.info_meeting_invitations as unknown as { status: string }[] | null) ?? [];
    const toSend = st.filter((i) => i.status === "a_envoyer").length;
    const hoursLeft = (new Date(m.starts_at).getTime() - now) / 3600_000;
    const when = formatMeetingWhen({ startsAt: m.starts_at });
    if (toSend) lines.push(`Réunion d'information ${when} : ${toSend} convocation${toSend > 1 ? "s" : ""} à envoyer — https://pef-erp.vercel.app/admission/${m.id}`);
    if (hoursLeft <= 36 && st.length) {
      const confirmed = st.filter((i) => i.status === "confirmee").length;
      lines.push(`Réunion d'information ${when} : ${st.length} convoqué${st.length > 1 ? "s" : ""}, ${confirmed} confirmé${confirmed > 1 ? "s" : ""} — rappels WhatsApp depuis https://pef-erp.vercel.app/admission/${m.id}`);
    }
  }
  return lines;
}

// ── Rappel de réunion d'information (la veille, par email) ──────────────────
// WhatsApp reste manuel (un clic par personne depuis la page de la réunion) ; l'email
// part tout seul pour les convoqués qui ont une adresse et une convocation envoyée/confirmée.
async function sendMeetingReminders(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ sent: number; skippedNoEmail: number }> {
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const dayAfter = nextDay(tomorrow);
  const { data: meetings } = await supabase
    .from("info_meetings")
    .select("id, starts_at, ends_at, location, rooms:room_id(name), info_meeting_invitations(status, learners(first_name, email))")
    .gte("starts_at", localToUtc(tomorrow, "00:00"))
    .lt("starts_at", localToUtc(dayAfter, "00:00"));

  let sent = 0;
  let skippedNoEmail = 0;
  for (const m of meetings ?? []) {
    const room = (m.rooms as unknown as { name: string } | null)?.name;
    const place = room ? `${room}${m.location ? ` — ${m.location}` : ""}` : m.location;
    const invitations = (m.info_meeting_invitations as unknown as { status: string; learners: { first_name: string; email: string | null } | null }[] | null) ?? [];
    for (const inv of invitations) {
      if (!["envoyee", "confirmee"].includes(inv.status) || !inv.learners) continue;
      if (!inv.learners.email) {
        skippedNoEmail += 1;
        continue;
      }
      const text = buildMeetingReminderMessage({
        learnerFirstName: inv.learners.first_name,
        senderFirstName: null,
        meeting: { startsAt: m.starts_at, endsAt: m.ends_at, place },
      });
      const ok = await sendMail({
        to: inv.learners.email,
        subject: "Rappel : réunion d'information demain — cours de français",
        html: textToHtml(text),
      });
      if (ok) sent += 1;
    }
  }
  return { sent, skippedNoEmail };
}

// ── Rappels de séances aux apprenants (la veille) ────────────────────────────
// Un email par apprenant listant ses séances du lendemain, uniquement pour les
// groupes ayant activé les rappels. Les apprenants sans email sont simplement
// comptés (le canal SMS viendra ensuite).
async function sendSessionReminders(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ sent: number; skippedNoEmail: number }> {
  const tomorrow = new Date(Date.now() + 24 * 3600_000)
    .toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // YYYY-MM-DD local
  const dayAfter = nextDay(tomorrow);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("group_id, starts_at, ends_at, groups!inner(name, reminders_enabled), rooms:room_id(name)")
    .eq("status", "planifiee")
    .eq("groups.reminders_enabled", true)
    .gte("starts_at", localToUtc(tomorrow, "00:00"))
    .lt("starts_at", localToUtc(dayAfter, "00:00"));
  if (!sessions?.length) return { sent: 0, skippedNoEmail: 0 };

  const groupIds = [...new Set(sessions.map((s) => s.group_id))];
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("group_id, learners(id, first_name, email)")
    .in("group_id", groupIds)
    .eq("status", "inscrit");

  // learner → ses séances de demain
  const byLearner = new Map<string, { firstName: string; email: string | null; lines: string[] }>();
  for (const e of enrollments ?? []) {
    const learner = e.learners as unknown as { id: string; first_name: string; email: string | null } | null;
    if (!learner) continue;
    const entry = byLearner.get(learner.id) ?? { firstName: learner.first_name, email: learner.email, lines: [] };
    for (const s of sessions.filter((x) => x.group_id === e.group_id)) {
      const g = s.groups as unknown as { name: string };
      const room = (s.rooms as unknown as { name: string } | null)?.name;
      entry.lines.push(
        `${utcToLocalTime(s.starts_at)}–${utcToLocalTime(s.ends_at)} · ${g.name}${room ? ` · ${room}` : ""}`,
      );
    }
    if (entry.lines.length) byLearner.set(learner.id, entry);
  }

  const dayLabel = new Date(localToUtc(tomorrow, "12:00")).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });
  let sent = 0;
  let skippedNoEmail = 0;
  for (const entry of byLearner.values()) {
    if (!entry.email) {
      skippedNoEmail += 1;
      continue;
    }
    const ok = await sendMail({
      to: entry.email,
      subject: `Rappel : votre cours de français demain (${dayLabel})`,
      html: `<p>Bonjour ${entry.firstName},</p>
<p>Vous avez cours demain <strong>${dayLabel}</strong> :</p>
<ul>${entry.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
<p>À demain !<br/>ParlerEmploi Formation</p>`,
    });
    if (ok) sent += 1;
  }
  return { sent, skippedNoEmail };
}

// ── Relance des formateurs : feuilles d'émargement non clôturées ─────────────
type UnclosedRow = {
  id: string;
  starts_at: string;
  groups: unknown;
  trainers: unknown;
};

async function sendTrainerRelances(unclosed: UnclosedRow[]): Promise<number> {
  const byTrainer = new Map<string, { firstName: string; lines: string[] }>();
  for (const s of unclosed) {
    const trainer = s.trainers as { first_name: string; email: string | null } | null;
    if (!trainer?.email) continue;
    const group = (s.groups as { name: string } | null)?.name ?? "?";
    const day = new Date(s.starts_at).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
    });
    const entry = byTrainer.get(trainer.email) ?? { firstName: trainer.first_name, lines: [] };
    entry.lines.push(`${group} — séance du ${day} : https://pef-erp.vercel.app/seances/${s.id}/emargement`);
    byTrainer.set(trainer.email, entry);
  }

  let sent = 0;
  for (const [email, entry] of byTrainer) {
    const ok = await sendMail({
      to: email,
      subject: `Feuille${entry.lines.length > 1 ? "s" : ""} d'émargement à clôturer`,
      html: `<p>Bonjour ${entry.firstName},</p>
<p>Il reste ${entry.lines.length > 1 ? "des feuilles" : "une feuille"} d'émargement à contre-signer et clôturer :</p>
<ul>${entry.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
<p>Merci !<br/>ParlerEmploi Formation</p>`,
    });
    if (ok) sent += 1;
  }
  return sent;
}

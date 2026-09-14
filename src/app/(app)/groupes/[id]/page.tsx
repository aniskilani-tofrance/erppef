import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { utcToLocalTime } from "@/lib/dates";
import { groupRef } from "@/lib/refs";
import { EnrollmentManager } from "@/components/groupes/enrollment-manager";
import { GroupEditDialog } from "@/components/groupes/group-edit-dialog";
import { DuplicateGroupDialog } from "@/components/groupes/duplicate-group-dialog";
import { ReplanButton } from "@/components/groupes/replan-button";
import { SurveyManager } from "@/components/groupes/survey-manager";
import { PlanningShare, type PlanningRecipient } from "@/components/groupes/planning-share";
import { AttendanceDispatchCard, type DispatchHistoryRow } from "@/components/groupes/attendance-dispatch-card";
import { KIND_LABELS } from "@/lib/evaluations/grid";
import { STATE_LABELS, computeMilestones, milestoneState, type MilestoneSession, type MilestoneState } from "@/lib/evaluations/milestones";

const MILESTONE_CLASS: Record<MilestoneState, string> = {
  sans_date: "border-gray-300 bg-gray-100 text-gray-600",
  a_venir: "border-sky-300 bg-sky-50 text-sky-800",
  bientot: "border-amber-300 bg-amber-50 text-amber-800",
  a_faire: "border-red-300 bg-red-50 text-red-700",
  en_cours: "border-violet-300 bg-violet-50 text-violet-800",
  faite: "border-emerald-300 bg-emerald-50 text-emerald-800",
};
import { loadTemplates } from "@/lib/admission/load-templates";
import { baseVars, buildStageMessage } from "@/lib/admission/templates";
import { describeHolidays, describePattern, fmtDay as fmtPlanningDay, loadGroupPlanning } from "@/lib/reports/group-planning";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  sessionHours,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

export default async function GroupePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, userId } = await requireSession();
  const supabase = await createClient();

  const [{ data: group }, { data: sessions }, { data: hours }, { data: enrollments }, { data: learners }, { data: allFunders }, { data: attendanceRows }, { data: surveyRows }, templates, { data: profile }] =
    await Promise.all([
      supabase
        .from("groups")
        .select("*, programs(name, level, entry_level), funders(name, color), trainers:trainer_id(first_name, last_name), rooms:room_id(name, address, access_notes)")
        .eq("id", id)
        .single(),
      supabase
        .from("sessions")
        .select("id, starts_at, ends_at, status, trainers:trainer_id(first_name), rooms:room_id(name)")
        .eq("group_id", id)
        .order("starts_at"),
      supabase.from("v_group_hours").select("*").eq("group_id", id).single(),
      supabase
        .from("enrollments")
        .select("id, learner_id, status, left_on, learners(first_name, last_name, level_assessed, phone, email)")
        .eq("group_id", id)
        .order("status"), // abandons et terminés restent visibles (badges + bilans)
      supabase.from("learners").select("id, first_name, last_name, learner_no, level_assessed, first_language, city, district, qpv, gender, activity_status, education_level, prescriber, birth_date").order("last_name"),
      supabase.from("funders").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("attendances")
        .select("learner_id, status, sessions!inner(starts_at, ends_at, attendance_closed_at, group_id)")
        .eq("sessions.group_id", id)
        .not("sessions.attendance_closed_at", "is", null),
      supabase
        .from("survey_responses")
        .select("overall, teaching, organization, premises, progress, comment")
        .eq("group_id", id),
      loadTemplates(supabase),
      supabase.from("profiles").select("full_name").eq("id", userId).single(),
    ]);

  if (!group) notFound();
  const planningData = await loadGroupPlanning(supabase, id);

  // Planning à diffuser : message WhatsApp par inscrit (horaires, dates, lieu du groupe)
  const senderFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const roomInfo = group.rooms as unknown as { name: string; address: string | null; access_notes: string | null } | null;
  const planningVars = {
    groupe: group.name,
    horaires: describePattern(((group.weekly_pattern as { weekday: number; start: string; end: string }[] | null) ?? []), ", "),
    date_debut: fmtPlanningDay(group.starts_on),
    date_fin: group.ends_on ? fmtPlanningDay(group.ends_on) : null,
    lieu: roomInfo ? [roomInfo.name, roomInfo.address].filter(Boolean).join(" — ") : null,
    acces: roomInfo?.access_notes ?? null,
    vacances: planningData ? describeHolidays(planningData) : (group.skip_school_holidays === false ? "Les cours ont lieu aussi pendant les vacances scolaires." : "Pas de cours pendant les vacances scolaires."),
  };
  const planningRecipients: PlanningRecipient[] = (enrollments ?? [])
    .filter((e) => e.status === "inscrit")
    .map((e) => {
      const l = e.learners as unknown as { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
      return {
        learnerId: e.learner_id,
        name: l ? `${l.first_name} ${l.last_name}` : "—",
        phone: l?.phone ?? null,
        email: l?.email ?? null,
        message: buildStageMessage("planning_groupe", { ...baseVars(l?.first_name, senderFirstName), ...planningVars }, templates),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const canWrite = role === "admin" || role === "coordinator";

  // Envoi hebdomadaire des feuilles d'émargement au financeur : réglages (colonnes du groupe) + historique.
  const { data: dispatchRows } = canWrite
    ? await supabase
        .from("attendance_dispatches")
        .select("id, sent_at, mode, status, recipients, cc, session_ids, missing_session_ids, period_from, period_to, error")
        .eq("group_id", id)
        .order("sent_at", { ascending: false })
        .limit(10)
    : { data: [] };
  // Jalons d'évaluation (mi-parcours / finale) : date, état, avancement des grilles.
  const { data: evaluationRows } = await supabase.from("evaluations").select("kind, co, po, ce, pe").eq("group_id", id);
  const milestones = computeMilestones((sessions ?? []) as MilestoneSession[], { midterm_on: group.midterm_on, final_on: group.final_on });
  const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const enrolledCount = (enrollments ?? []).filter((e) => e.status === "inscrit").length;
  const evaluationMilestones = (["mi_parcours", "finale"] as const).map((kind) => {
    const on = kind === "mi_parcours" ? milestones.midterm.on : milestones.final.on;
    const done = (evaluationRows ?? []).filter((e) => e.kind === kind && (e.co || e.po || e.ce || e.pe)).length;
    const state = milestoneState(on, today, done, enrolledCount);
    return {
      kind,
      label: KIND_LABELS[kind],
      date: on ? new Date(`${on}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }) : "—",
      state: `${STATE_LABELS[state]}${enrolledCount ? ` · ${done}/${enrolledCount}` : ""}`,
      className: MILESTONE_CLASS[state],
    };
  });
  const dispatchHistory: DispatchHistoryRow[] = (dispatchRows ?? []).map((d) => ({
    id: d.id,
    sentAt: d.sent_at,
    mode: d.mode,
    status: d.status,
    recipients: d.recipients ?? [],
    cc: d.cc ?? [],
    sheets: (d.session_ids ?? []).length,
    missing: (d.missing_session_ids ?? []).length,
    periodFrom: d.period_from,
    periodTo: d.period_to,
    error: d.error,
  }));
  const enrolled = (enrollments ?? []).map((e) => {
    const l = e.learners as unknown as { first_name: string; last_name: string; level_assessed: string | null } | null;
    return {
      enrollmentId: e.id,
      learnerId: e.learner_id,
      name: l ? `${l.first_name} ${l.last_name}` : "—",
      level: l?.level_assessed ?? null,
      status: e.status as "inscrit" | "abandon" | "termine",
      leftOn: e.left_on ?? null,
    };
  });
  const enrolledIds = new Set(enrolled.map((e) => e.learnerId));
  const available = (learners ?? [])
    .filter((l) => !enrolledIds.has(l.id))
    .map((l) => ({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`,
      ref: l.learner_no != null ? `A-${String(l.learner_no).padStart(4, "0")}` : "—",
      level: l.level_assessed,
      language: l.first_language,
      city: l.city,
      district: l.district,
      qpv: l.qpv,
      gender: l.gender,
      activity: l.activity_status,
      education: l.education_level,
      prescriber: l.prescriber,
      birthDate: l.birth_date,
    }));

  // Enquête satisfaction : stats agrégées + lien public si ouverte
  const avg = (key: "overall" | "teaching" | "organization" | "premises" | "progress") => {
    const vals = (surveyRows ?? []).map((r) => r[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const surveyStats = {
    count: (surveyRows ?? []).length,
    averages: [
      { label: "Satisfaction globale", value: avg("overall") },
      { label: "Qualité pédagogique", value: avg("teaching") },
      { label: "Organisation", value: avg("organization") },
      { label: "Locaux et matériel", value: avg("premises") },
      { label: "Progression ressentie", value: avg("progress") },
    ],
    comments: (surveyRows ?? []).map((r) => r.comment).filter((c): c is string => Boolean(c)),
  };
  let surveyUrl: string | null = null;
  let surveyQr: string | null = null;
  if (group.survey_token) {
    const h = await headers();
    surveyUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/enquete/${group.survey_token}`;
    surveyQr = await QRCode.toDataURL(surveyUrl, { width: 220, margin: 1 });
  }

  const records: AttendanceRecord[] = (attendanceRows ?? []).map((a) => {
    const s = a.sessions as unknown as { starts_at: string; ends_at: string };
    return {
      learnerId: a.learner_id,
      status: a.status as AttendanceRecord["status"],
      startsAt: s.starts_at,
      hours: sessionHours(s.starts_at, s.ends_at),
    };
  });
  const attendanceStats = computeLearnerStats(records);

  const done = hours ? Number(hours.hours_done) : 0;
  const scheduled = hours ? Number(hours.hours_scheduled) : 0;
  const total = Number(group.total_hours);
  const funder = group.funders as unknown as { name: string; color: string } | null;
  const trainer = group.trainers as unknown as { first_name: string; last_name: string } | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <span className="font-mono text-sm text-muted-foreground">{groupRef(group.group_no)}</span>
        {funder && (
          <Badge style={{ backgroundColor: funder.color, color: "white" }}>{funder.name}</Badge>
        )}
        <span className="ml-auto flex items-center gap-3">
          {canWrite && <DuplicateGroupDialog groupId={id} groupName={group.name} />}
          {canWrite && (
            <GroupEditDialog
              groupId={id}
              initial={{
                name: group.name,
                status: group.status,
                funderId: group.funder_id,
                capacity: group.capacity,
                notes: group.notes,
                remindersEnabled: group.reminders_enabled ?? false,
              }}
              funders={allFunders ?? []}
            />
          )}
          <Link href="/groupes" className="text-sm text-muted-foreground hover:underline">
            ← Tous les groupes
          </Link>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispositif</p>
            <p className="mt-1 font-medium">{(group.programs as unknown as { name: string } | null)?.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Formateur</p>
            <p className="mt-1 font-medium">
              {trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : "Non affecté"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Salle</p>
            <p className="mt-1 font-medium">{(group.rooms as unknown as { name: string } | null)?.name ?? "Non réservée"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avancement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={total > 0 ? (done / total) * 100 : 0} />
          <p className="text-sm text-muted-foreground">
            {Math.round(done)} h réalisées · {Math.round(scheduled)} h planifiées · {total} h au total
          </p>
        </CardContent>
      </Card>

      {canWrite && total - scheduled > 0.01 && group.status !== "termine" && group.status !== "annule" && (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <p className="text-sm">
              ⚠️ <span className="font-medium">{Math.round((total - scheduled) * 10) / 10} h manquantes</span>{" "}
              au planning (séances annulées ou volume incomplet) sur les {total} h du dispositif.
            </p>
            <span className="ml-auto">
              <ReplanButton groupId={id} />
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diffuser le planning</CardTitle>
          <p className="text-sm text-muted-foreground">
            Aux apprenants : WhatsApp (message pré-rempli), PDF lisible ou calendrier .ics. Au financeur : PDF prévisionnel et CSV.
          </p>
        </CardHeader>
        <CardContent>
          <PlanningShare groupId={id} recipients={planningRecipients} canWrite={canWrite} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Évaluations de parcours</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mi-parcours à la moitié des heures, finale à la dernière séance : grille par compétence (CECRL, trois crans), test ciblé en appui, attestation d&apos;acquis en fin de parcours.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          {evaluationMilestones.map((m) => (
            <span key={m.kind} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5">
              <span className="font-medium">{m.label}</span>
              <span className="text-muted-foreground">{m.date}</span>
              <Badge variant="outline" className={m.className}>{m.state}</Badge>
            </span>
          ))}
          <Link href={`/groupes/${id}/evaluations`} className="ml-auto text-sm font-medium hover:underline">Ouvrir les évaluations →</Link>
        </CardContent>
      </Card>

      {canWrite && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feuilles d&apos;émargement au financeur</CardTitle>
            <p className="text-sm text-muted-foreground">
              Chaque vendredi après-midi, les feuilles clôturées de la semaine partent par email (une feuille PDF par séance) aux
              destinataires ci-dessous. Une feuille non clôturée est signalée et part la semaine suivante.
            </p>
          </CardHeader>
          <CardContent>
            <AttendanceDispatchCard
              groupId={id}
              enabled={Boolean(group.attendance_mail_enabled)}
              to={(group.attendance_mail_to as string[] | null) ?? []}
              cc={(group.attendance_mail_cc as string[] | null) ?? []}
              lastSentAt={(group.attendance_mail_last_sent_at as string | null) ?? null}
              history={dispatchHistory}
              canWrite={canWrite}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Apprenants ({enrolled.length}
            {group.capacity ? ` / ${group.capacity}` : ""})
            {group.capacity && enrolled.length > group.capacity && (
              <Badge variant="destructive" className="ml-2">Capacité dépassée</Badge>
            )}
          </CardTitle>
          {canWrite && attendanceStats.size > 0 && (
            <Link href={`/groupes/${id}/assiduite`} className="text-sm text-muted-foreground hover:underline">
              Export assiduité (CSV) →
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {canWrite ? (
            <EnrollmentManager
              groupId={id}
              groupName={group.name}
              enrolled={enrolled.map((e) => ({ ...e, stats: attendanceStats.get(e.learnerId) ?? null }))}
              available={available}
              suggestedLevel={(group.programs as unknown as { entry_level?: string | null } | null)?.entry_level ?? null}
            />
          ) : (
            <ul className="space-y-1 text-sm">
              {enrolled.length === 0 && <li className="text-muted-foreground">Aucun apprenant inscrit.</li>}
              {enrolled.map((e) => {
                const st = attendanceStats.get(e.learnerId);
                return (
                  <li key={e.enrollmentId}>
                    {e.name}
                    {e.level && <span className="ml-2 text-muted-foreground">{e.level}</span>}
                    {st && <span className="ml-2 text-muted-foreground">{st.rate} % de présence</span>}
                    {st && st.consecutiveAbsences >= ABSENCE_ALERT_THRESHOLD && (
                      <Badge variant="destructive" className="ml-2">
                        {st.consecutiveAbsences} absences de suite
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enquête de satisfaction (Qualiopi)</CardTitle>
          </CardHeader>
          <CardContent>
            <SurveyManager
              groupId={id}
              isOpen={Boolean(group.survey_token)}
              publicUrl={surveyUrl}
              qrDataUrl={surveyQr}
              stats={surveyStats}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Séances ({(sessions ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Horaire</TableHead>
                  <TableHead>Formateur</TableHead>
                  <TableHead>Salle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Émargement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{formatDateTime(s.starts_at)}</TableCell>
                    <TableCell>
                      {utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}
                    </TableCell>
                    <TableCell>{(s.trainers as unknown as { first_name: string } | null)?.first_name ?? "—"}</TableCell>
                    <TableCell>{(s.rooms as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "annulee" ? "destructive" : s.status === "realisee" ? "secondary" : "outline"}>
                        {{ planifiee: "Planifiée", realisee: "Réalisée", annulee: "Annulée" }[s.status as string]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.status !== "annulee" && (
                        <Link href={`/seances/${s.id}/emargement`} className="text-sm text-muted-foreground hover:underline">
                          Feuille →
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

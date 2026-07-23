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
import { EnrollmentManager } from "@/components/groupes/enrollment-manager";
import { SurveyManager } from "@/components/groupes/survey-manager";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  sessionHours,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

export default async function GroupePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireSession();
  const supabase = await createClient();

  const [{ data: group }, { data: sessions }, { data: hours }, { data: enrollments }, { data: learners }, { data: attendanceRows }, { data: surveyRows }] =
    await Promise.all([
      supabase
        .from("groups")
        .select("*, programs(name, level), funders(name, color), trainers:trainer_id(first_name, last_name), rooms:room_id(name)")
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
        .select("id, learner_id, status, learners(first_name, last_name, level_assessed)")
        .eq("group_id", id)
        .eq("status", "inscrit"),
      supabase.from("learners").select("id, first_name, last_name").order("last_name"),
      supabase
        .from("attendances")
        .select("learner_id, status, sessions!inner(starts_at, ends_at, attendance_closed_at, group_id)")
        .eq("sessions.group_id", id)
        .not("sessions.attendance_closed_at", "is", null),
      supabase
        .from("survey_responses")
        .select("overall, teaching, organization, premises, progress, comment")
        .eq("group_id", id),
    ]);

  if (!group) notFound();

  const canWrite = role === "admin" || role === "coordinator";
  const enrolled = (enrollments ?? []).map((e) => {
    const l = e.learners as unknown as { first_name: string; last_name: string; level_assessed: string | null } | null;
    return {
      enrollmentId: e.id,
      learnerId: e.learner_id,
      name: l ? `${l.first_name} ${l.last_name}` : "—",
      level: l?.level_assessed ?? null,
    };
  });
  const enrolledIds = new Set(enrolled.map((e) => e.learnerId));
  const available = (learners ?? [])
    .filter((l) => !enrolledIds.has(l.id))
    .map((l) => ({ id: l.id, name: `${l.first_name} ${l.last_name}` }));

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
        {funder && (
          <Badge style={{ backgroundColor: funder.color, color: "white" }}>{funder.name}</Badge>
        )}
        <Link href="/groupes" className="ml-auto text-sm text-muted-foreground hover:underline">
          ← Tous les groupes
        </Link>
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

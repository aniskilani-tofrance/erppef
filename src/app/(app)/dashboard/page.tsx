import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import { TrainerDashboard } from "@/components/dashboard/trainer-dashboard";
import { ViewerDashboard } from "@/components/dashboard/viewer-dashboard";
import { weekStartOf } from "@/lib/dates";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ClipboardCheck, DoorOpen, Users, UsersRound } from "lucide-react";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Seuil d'alerte assiduité : en dessous, l'apprenant apparaît nommément sur le dashboard.
const RATE_ALERT_THRESHOLD = 70;

// Une vue par type de compte : le formateur voit SA journée, pas les taux
// d'occupation ; le lecteur voit l'essentiel ; l'équipe voit le pilotage complet.
export default async function DashboardPage() {
  const { role, userId } = await requireSession();
  if (role === "trainer") return <TrainerDashboard userId={userId} />;
  if (role === "viewer") return <ViewerDashboard />;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(today);

  const trainersQuery = supabase
    .from("trainers")
    .select("id, first_name, last_name, weekly_hours_max")
    .eq("is_active", true);

  const [groups, weekLoads, roomLoads, trainers, rooms, attendanceRows, learnersList] = await Promise.all([
    supabase.from("groups").select("id, status", { count: "exact" }).in("status", ["ouvert", "complet", "en_attente"]),
    supabase.from("v_trainer_week_load").select("*").eq("week_start", weekStart),
    supabase.from("v_room_week_load").select("*").eq("week_start", weekStart),
    trainersQuery,
    supabase.from("rooms").select("id, name").eq("is_active", true),
    supabase
      .from("attendances")
      .select("learner_id, status, sessions!inner(starts_at, attendance_closed_at)")
      .not("sessions.attendance_closed_at", "is", null),
    supabase.from("learners").select("id, first_name, last_name"),
  ]);

  // Assiduité : taux global + apprenants en alerte (série d'absences ou taux faible)
  const attendanceRecords: AttendanceRecord[] = (attendanceRows.data ?? []).map((a) => ({
    learnerId: a.learner_id,
    status: a.status as AttendanceRecord["status"],
    startsAt: (a.sessions as unknown as { starts_at: string }).starts_at,
  }));
  const learnerStats = computeLearnerStats(attendanceRecords);
  const presentMarks = attendanceRecords.filter((r) => r.status !== "absent").length;
  const globalRate = attendanceRecords.length
    ? Math.round((presentMarks / attendanceRecords.length) * 100)
    : null;
  const learnerNameById = new Map((learnersList.data ?? []).map((l) => [l.id, `${l.first_name} ${l.last_name}`]));
  const atRiskLearners = [...learnerStats.entries()]
    .filter(
      ([, st]) =>
        st.consecutiveAbsences >= ABSENCE_ALERT_THRESHOLD ||
        (st.total >= 3 && st.rate < RATE_ALERT_THRESHOLD),
    )
    .map(([id, st]) => ({
      name: learnerNameById.get(id) ?? "—",
      rate: st.rate,
      streak: st.consecutiveAbsences,
    }))
    .sort((a, b) => a.rate - b.rate);

  const hoursThisWeek = (weekLoads.data ?? []).reduce((s, l) => s + Number(l.hours_planned), 0);

  const trainerStats = (trainers.data ?? []).map((t) => {
    const load = (weekLoads.data ?? []).find((l) => l.trainer_id === t.id);
    const planned = load ? Number(load.hours_planned) : 0;
    const max = Number(t.weekly_hours_max);
    return {
      name: `${t.first_name} ${t.last_name ?? ""}`.trim(),
      planned,
      max,
      rate: max > 0 ? Math.round((planned / max) * 100) : 0,
    };
  });

  // 45 h de plage utile hebdo par salle (9h-18h × 5 j) : approximation V1 pour le taux d'occupation
  const roomStats = (rooms.data ?? []).map((r) => {
    const load = (roomLoads.data ?? []).find((l) => l.room_id === r.id);
    const booked = load ? Number(load.hours_booked) : 0;
    return { name: r.name, booked, rate: Math.round((booked / 45) * 100) };
  });

  const avgTrainerRate = trainerStats.length
    ? Math.round(trainerStats.reduce((s, t) => s + t.rate, 0) / trainerStats.length)
    : 0;
  const avgRoomRate = roomStats.length
    ? Math.round(roomStats.reduce((s, r) => s + r.rate, 0) / roomStats.length)
    : 0;

  const alerts: string[] = [];
  for (const t of trainerStats) {
    const remaining = t.max - t.planned;
    if (t.planned > t.max) {
      alerts.push(`⚠️ ${t.name} dépasse son plafond (${t.planned} h / ${t.max} h cette semaine).`);
    } else if (remaining >= 3) {
      alerts.push(`${t.name} encore disponible ${formatHours(remaining)} cette semaine.`);
    }
  }
  for (const r of roomStats) {
    if (r.rate < 40) alerts.push(`${r.name} peu occupée cette semaine (${r.rate} %).`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard icon={<UsersRound className="h-4 w-4" />} label="Groupes actifs" value={String(groups.count ?? 0)} />
        <KpiCard icon={<CalendarDays className="h-4 w-4" />} label="Heures cette semaine" value={formatHours(hoursThisWeek)} />
        <KpiCard
          icon={<ClipboardCheck className="h-4 w-4" />}
          label="Taux de présence"
          value={globalRate !== null ? `${globalRate} %` : "—"}
          alert={globalRate !== null && globalRate < RATE_ALERT_THRESHOLD}
        />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Occupation formateurs" value={`${avgTrainerRate} %`} />
        <KpiCard icon={<DoorOpen className="h-4 w-4" />} label="Occupation salles" value={`${avgRoomRate} %`} />
      </div>

      {atRiskLearners.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">
              ⚠️ Assiduité : {atRiskLearners.length} apprenant{atRiskLearners.length > 1 ? "s" : ""} en alerte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="flex flex-wrap gap-2">
              {atRiskLearners.map((l) => (
                <li key={l.name}>
                  <Badge variant="destructive" className="text-sm">
                    {l.name} — {l.rate} % de présence
                    {l.streak >= 3 ? ` · ${l.streak} abs. de suite` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Seuils : moins de {RATE_ALERT_THRESHOLD} % de présence (sur 3 séances émargées ou plus)
              ou 3 absences consécutives.{" "}
              <Link href="/apprenants" className="hover:underline">Voir les apprenants →</Link>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Charge des formateurs (semaine en cours)</CardTitle>
          </CardHeader>
          <CardContent>
            <OccupancyChart
              data={trainerStats.map((t) => ({ name: t.name, valeur: t.planned, plafond: t.max }))}
              unit="h"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">Rien à signaler cette semaine.</p>
            )}
            {alerts.slice(0, 6).map((a, i) => (
              <Alert key={i}>
                <AlertDescription>{a}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      </div>

      {trainerStats.some((t) => t.planned > t.max) && (
        <Alert variant="destructive">
          <AlertTitle>Dépassement de plafond détecté</AlertTitle>
          <AlertDescription>
            Un formateur dépasse ses heures contractuelles cette semaine. Vérifiez le planning.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-destructive/50" : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-medium uppercase tracking-wide">{label}</span></div>
        <p className={`mt-2 text-2xl font-semibold ${alert ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function formatHours(h: number): string {
  return `${Math.round(h * 10) / 10} h`;
}

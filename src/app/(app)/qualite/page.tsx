import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ComplaintsManager } from "@/components/qualite/complaints-manager";
import {
  ABSENCE_ALERT_THRESHOLD,
  computeLearnerStats,
  type AttendanceRecord,
} from "@/lib/attendance-stats";

// Correspondance indicateur Qualiopi → preuve produite par l'ERP.
const INDICATORS: { ind: string; label: string; proof: string; href: string }[] = [
  { ind: "8", label: "Positionnement à l'entrée", proof: "Niveau évalué sur chaque fiche apprenant", href: "/apprenants" },
  { ind: "11", label: "Atteinte des objectifs", proof: "Avancement heures réalisées / prévues par groupe", href: "/groupes" },
  { ind: "12", label: "Engagement et assiduité", proof: "Émargement électronique, taux d'assiduité, alertes décrochage", href: "/apprenants" },
  { ind: "17", label: "Moyens mobilisés", proof: "Salles, capacités, équipements, planning", href: "/salles" },
  { ind: "21-22", label: "Compétences des formateurs", proof: "CV, diplômes et attestations sur chaque fiche formateur", href: "/formateurs" },
  { ind: "30", label: "Recueil des appréciations", proof: "Enquêtes de satisfaction anonymes par groupe", href: "/groupes" },
  { ind: "31", label: "Traitement des réclamations", proof: "Registre des réclamations ci-dessous", href: "/qualite" },
  { ind: "32", label: "Amélioration continue", proof: "Actions correctives tracées sur chaque réclamation + résultats d'enquêtes", href: "/qualite" },
];

export default async function QualitePage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: attendanceRows }, { data: hours }, { data: surveys }, { data: complaints }, { data: learners }] =
    await Promise.all([
      supabase
        .from("attendances")
        .select("learner_id, status, sessions!inner(starts_at, attendance_closed_at)")
        .not("sessions.attendance_closed_at", "is", null),
      supabase.from("v_group_hours").select("total_hours, hours_scheduled, hours_done"),
      supabase.from("survey_responses").select("overall"),
      supabase.from("complaints").select("*").order("received_on", { ascending: false }),
      supabase.from("learners").select("id, first_name, last_name"),
    ]);

  // Assiduité globale + alertes décrochage
  const records: AttendanceRecord[] = (attendanceRows ?? []).map((a) => ({
    learnerId: a.learner_id,
    status: a.status as AttendanceRecord["status"],
    startsAt: (a.sessions as unknown as { starts_at: string }).starts_at,
  }));
  const stats = computeLearnerStats(records);
  const totalMarks = records.length;
  const presentMarks = records.filter((r) => r.status !== "absent").length;
  const globalRate = totalMarks ? Math.round((presentMarks / totalMarks) * 100) : null;

  const nameById = new Map((learners ?? []).map((l) => [l.id, `${l.first_name} ${l.last_name}`]));
  const atRisk = [...stats.entries()]
    .filter(([, s]) => s.consecutiveAbsences >= ABSENCE_ALERT_THRESHOLD)
    .map(([id, s]) => ({ name: nameById.get(id) ?? "—", streak: s.consecutiveAbsences }));

  const hoursDone = (hours ?? []).reduce((s, h) => s + Number(h.hours_done), 0);
  const hoursScheduled = (hours ?? []).reduce((s, h) => s + Number(h.hours_scheduled), 0);

  const overallNotes = (surveys ?? []).map((s) => s.overall);
  const satisfaction = overallNotes.length
    ? overallNotes.reduce((s, v) => s + v, 0) / overallNotes.length
    : null;

  const openComplaints = (complaints ?? []).filter((c) => c.status !== "traitee").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Qualité (Qualiopi)</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Assiduité globale" value={globalRate !== null ? `${globalRate} %` : "—"} sub={totalMarks ? `${totalMarks} émargements` : "aucun émargement clôturé"} />
        <Kpi label="Heures réalisées" value={`${Math.round(hoursDone)} h`} sub={`sur ${Math.round(hoursScheduled)} h planifiées`} />
        <Kpi label="Satisfaction" value={satisfaction !== null ? `${satisfaction.toFixed(1).replace(".", ",")} / 5` : "—"} sub={overallNotes.length ? `${overallNotes.length} réponse${overallNotes.length > 1 ? "s" : ""}` : "aucune réponse"} />
        <Kpi label="Réclamations ouvertes" value={String(openComplaints)} sub={`${(complaints ?? []).length} au registre`} alert={openComplaints > 0} />
      </div>

      {atRisk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">⚠️ Risque de décrochage ({atRisk.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {atRisk.map((l) => (
                <li key={l.name}>
                  <Badge variant="destructive">{l.name} — {l.streak} absences de suite</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Contacter l&apos;apprenant et tracer l&apos;action (ind. 12) : un appel noté dans
              sa fiche (notes) suffit comme preuve de suivi.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registre des réclamations (ind. 31)</CardTitle>
        </CardHeader>
        <CardContent>
          <ComplaintsManager
            complaints={(complaints ?? []).map((c) => ({
              id: c.id,
              source: c.source,
              authorName: c.author_name,
              subject: c.subject,
              details: c.details,
              receivedOn: c.received_on,
              status: c.status,
              resolution: c.resolution,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Où sont les preuves — correspondance indicateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ind.</TableHead>
                <TableHead>Exigence</TableHead>
                <TableHead>Preuve dans l&apos;ERP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INDICATORS.map((i) => (
                <TableRow key={i.ind}>
                  <TableCell className="font-medium">{i.ind}</TableCell>
                  <TableCell>{i.label}</TableCell>
                  <TableCell>
                    <Link href={i.href} className="text-sm hover:underline">{i.proof} →</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Complément hors ERP à préparer pour l&apos;audit : veille (critère 6), analyse des
            besoins en amont (critère 2) et sous-traitance éventuelle (ind. 27).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${alert ? "text-destructive" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

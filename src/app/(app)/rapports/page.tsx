import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeFunderReport,
  loadFunderReportData,
  type FunderReport,
} from "@/lib/reports/funder-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReportFilters } from "@/components/rapports/report-filters";
import { DepositReportButton } from "@/components/rapports/deposit-report-button";
import { Download, FileText } from "lucide-react";

// Bilan d'activité par financeur : LA restitution attendue par la Ville, France
// Travail, le FSE… — heures, bénéficiaires, assiduité (émargements clôturés), typologie.
export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ funder?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const { data: funders } = await supabase
    .from("funders")
    .select("id, name, color")
    .eq("is_active", true)
    .order("name");

  const year = new Date().getFullYear();
  const from = isDay(params.from) ? params.from! : `${year}-01-01`;
  const to = isDay(params.to) ? params.to! : `${year}-12-31`;
  const funderId = params.funder && (funders ?? []).some((f) => f.id === params.funder)
    ? params.funder
    : null;

  let report: FunderReport | null = null;
  if (funderId) {
    const data = await loadFunderReportData(orgId, funderId, from, to);
    if (data) report = computeFunderReport(data);
  }

  const exportQuery = `?from=${from}&to=${to}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bilan d&apos;activité par financeur : heures réalisées, bénéficiaires, assiduité émargée, typologie des publics.
        </p>
      </div>

      <ReportFilters funders={funders ?? []} funderId={funderId} from={from} to={to} />

      {!funderId && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Choisissez un financeur pour générer son bilan.
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/rapports/financeur/${funderId}/pdf${exportQuery}`}>
                <FileText className="mr-2 h-4 w-4" />
                Bilan PDF
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/rapports/financeur/${funderId}/csv${exportQuery}`}>
                <Download className="mr-2 h-4 w-4" />
                Détail CSV
              </a>
            </Button>
            <DepositReportButton funderId={funderId!} from={from} to={to} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Groupes" value={String(report.totals.groupCount)} />
            <Kpi label="Heures réalisées" value={`${report.totals.hoursDone.toLocaleString("fr-FR")} h`} />
            <Kpi label="Bénéficiaires uniques" value={String(report.totals.uniqueLearners)} />
            <Kpi
              label="Assiduité moyenne"
              value={report.totals.averageAttendanceRate != null ? `${report.totals.averageAttendanceRate} %` : "—"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DistTable title="Sexe" dist={report.distributions.gender} />
            <DistTable title="Âge" dist={report.distributions.age} />
            <DistTable title="Situation" dist={report.distributions.activity} />
            <DistTable title="Quartiers prioritaires" dist={report.distributions.qpv} />
            <DistTable title="Scolarisation" dist={report.distributions.education} />
            <DistTable title="Communes" dist={report.distributions.cities.slice(0, 8)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Détail par groupe
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {report.totals.exits.abandon} abandon{report.totals.exits.abandon > 1 ? "s" : ""} ·{" "}
                  {report.totals.exits.termine} parcours terminé{report.totals.exits.termine > 1 ? "s" : ""} ·{" "}
                  {report.totals.hoursPlanned.toLocaleString("fr-FR")} h encore planifiées sur la période
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Groupe</TableHead>
                    <TableHead>Dispositif</TableHead>
                    <TableHead className="text-right">Inscrits</TableHead>
                    <TableHead className="text-right">Séances réalisées</TableHead>
                    <TableHead className="text-right">Heures</TableHead>
                    <TableHead className="text-right">Assiduité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.groupDetails.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Aucun groupe pour ce financeur sur la période.
                      </TableCell>
                    </TableRow>
                  )}
                  {report.groupDetails.map((g) => (
                    <TableRow key={g.groupId}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell>{g.programName ?? "—"}</TableCell>
                      <TableCell className="text-right">{g.learnerCount}</TableCell>
                      <TableCell className="text-right">{g.sessionsDone}</TableCell>
                      <TableCell className="text-right">{g.hoursDone.toLocaleString("fr-FR")} h</TableCell>
                      <TableCell className="text-right">
                        {g.attendanceRate != null ? `${g.attendanceRate} %` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DistTable({ title, dist }: { title: string; dist: { label: string; count: number }[] }) {
  const total = dist.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {dist.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {dist.map((d) => (
              <li key={d.label} className="flex items-baseline justify-between gap-2">
                <span className={d.label === "Non renseigné" ? "text-muted-foreground" : ""}>{d.label}</span>
                <span className="whitespace-nowrap font-medium">
                  {d.count}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {total > 0 ? `${Math.round((d.count / total) * 100)} %` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function isDay(v: string | undefined): boolean {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

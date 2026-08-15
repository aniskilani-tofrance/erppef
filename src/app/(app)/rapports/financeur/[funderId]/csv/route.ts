import { requireRole } from "@/lib/auth";
import { computeFunderReport, loadFunderReportData } from "@/lib/reports/funder-report";

// Détail nominatif du bilan financeur (par groupe puis par apprenant).
// Séparateur « ; » et BOM UTF-8 : ouverture directe dans Excel FR (pattern assiduite/route.ts).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ funderId: string }> },
) {
  const { funderId } = await params;
  const { orgId } = await requireRole(["admin", "coordinator"]);

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isDay(from) || !isDay(to)) return new Response("Période invalide", { status: 400 });

  const data = await loadFunderReportData(orgId, funderId, from!, to!);
  if (!data) return new Response("Financeur introuvable", { status: 404 });
  const report = computeFunderReport(data);

  const fmt = (n: number) => n.toFixed(1).replace(".", ",");
  const lines = [
    `Financeur;${report.funderName}`,
    `Période;du ${report.from} au ${report.to}`,
    `Édité le;${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`,
    "",
    "DÉTAIL PAR GROUPE",
    "Groupe;Dispositif;Inscrits;Séances réalisées;Heures réalisées;Assiduité moyenne",
    ...report.groupDetails.map(
      (g) =>
        `${g.name};${g.programName ?? ""};${g.learnerCount};${g.sessionsDone};${fmt(g.hoursDone)};${g.attendanceRate != null ? `${g.attendanceRate} %` : ""}`,
    ),
    "",
    "DÉTAIL PAR BÉNÉFICIAIRE",
    "Bénéficiaire;Groupes;Heures suivies (émargées);Taux de présence",
    ...report.learnerDetails.map(
      (l) =>
        `${l.name};${l.groups.join(", ")};${fmt(l.hoursAttended)};${l.rate != null ? `${l.rate} %` : ""}`,
    ),
  ];

  const csv = "\uFEFF" + lines.join("\r\n");
  const slug = report.funderName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bilan_${slug}_${report.from}_${report.to}.csv"`,
    },
  });
}

function isDay(v: string | null): boolean {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

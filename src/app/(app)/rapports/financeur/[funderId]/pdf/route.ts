import { requireRole } from "@/lib/auth";
import { computeFunderReport, loadFunderReportData } from "@/lib/reports/funder-report";
import { buildFunderReportPdf, reportFileName } from "@/lib/reports/funder-report-pdf";

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
  const pdf = await buildFunderReportPdf(report);

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(report)}"`,
    },
  });
}

function isDay(v: string | null): boolean {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

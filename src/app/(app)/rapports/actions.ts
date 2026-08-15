"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { computeFunderReport, loadFunderReportData } from "@/lib/reports/funder-report";
import { buildFunderReportPdf, reportFileName } from "@/lib/reports/funder-report-pdf";
import { driveConfigured, uploadBufferToDrive } from "@/lib/emargement/gdrive";

const schema = z.object({
  funderId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DepositResult = { ok: true } | { ok: false; error: string };

// Dépose le bilan PDF sur le Drive partagé, dossier « Bilans financeurs ».
export async function depositReportToDrive(raw: z.infer<typeof schema>): Promise<DepositResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Paramètres invalides" };
  const { funderId, from, to } = parsed.data;

  const { orgId } = await requireRole(["admin", "coordinator"]);

  if (!driveConfigured()) {
    return { ok: false, error: "Google Drive n'est pas configuré sur ce projet." };
  }

  const data = await loadFunderReportData(orgId, funderId, from, to);
  if (!data) return { ok: false, error: "Financeur introuvable" };

  const report = computeFunderReport(data);
  const pdf = await buildFunderReportPdf(report);

  try {
    await uploadBufferToDrive({
      folderName: "Bilans financeurs",
      fileName: reportFileName(report),
      data: Buffer.from(pdf),
      mimeType: "application/pdf",
    });
  } catch (e) {
    return { ok: false, error: `Dépôt Drive impossible : ${e instanceof Error ? e.message : "erreur inconnue"}` };
  }

  return { ok: true };
}

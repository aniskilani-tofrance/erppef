import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateVeille, jsonError, readJson } from "@/lib/veille/auth";
import { toRow, validateBatch } from "@/lib/veille/schema";

// POST /api/veille/entries/batch — dépôt d'un lot de fiches { run_id, fiches: [...] }.
//   • validation stricte de chaque fiche AVANT toute écriture : une seule invalide → 422,
//     rien n'est écrit, la réponse liste les rejets champ par champ ;
//   • insertion transactionnelle (fonction SQL veille_ingest_batch) : tout ou rien ;
//   • idempotence : une dedupe_key déjà connue est ignorée (jamais modifiée) ; rejouer le
//     même run_id ne crée aucun doublon et renvoie rejeu: true.
export const dynamic = "force-dynamic";

type IngestResult = {
  recues: number;
  creees: { dedupe_key: string; id: string }[];
  ignorees: { dedupe_key: string; motif: string }[];
  rejeu: boolean;
};

export async function POST(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);

  const body = await readJson(req);
  if (body === null) return jsonError(400, "Corps JSON invalide");

  const v = validateBatch(body);
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, erreur: v.erreur, run_id: v.runId, recues: v.recues, creees: [], ignorees: [], rejetees: v.rejetees },
      { status: v.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("veille_ingest_batch", {
    p_org: auth.org.id,
    p_run_id: v.runId,
    p_entries: v.fiches.map(toRow),
  });
  if (error || !data) {
    console.error("[veille/batch]", error?.message ?? "réponse vide");
    return jsonError(500, "Erreur serveur : lot non enregistré (aucune écriture effectuée)", { run_id: v.runId, recues: v.fiches.length, creees: [], ignorees: [], rejetees: [] });
  }
  const r = data as IngestResult;
  return NextResponse.json(
    { ok: true, run_id: v.runId, recues: r.recues, creees: r.creees, ignorees: r.ignorees, rejetees: [], rejeu: r.rejeu },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

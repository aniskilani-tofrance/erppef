import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateVeille, jsonError, jsonOk, readJson } from "@/lib/veille/auth";
import { notifyVeilleRun, type RunRow } from "@/lib/veille/notify";
import { normalizeRunBody, runSchema } from "@/lib/veille/schema";

// Journal des exécutions du collecteur.
//   POST { run_id, statut, debut?, fin?, message?, stats?, csv_secours?, notifier? }
//        → création ou mise à jour (idempotent par run_id). Un statut final (succes,
//          partiel, echec) déclenche le résumé par email vers PEF_VEILLE_NOTIFY_TO,
//          une seule fois par run (sauf notifier: true explicite).
//   GET  ?limit=20 → consultation
export const dynamic = "force-dynamic";

const COLS = "run_id, status, received, created, ignored, rejected, replays, started_at, finished_at, batch_at, csv_url, csv_name, message, stats, notified_at, created_at, updated_at";
const FINAL = new Set(["succes", "partiel", "echec"]);

function toApi(r: Record<string, unknown>) {
  return {
    run_id: r.run_id,
    statut: r.status,
    recues: r.received,
    creees: r.created,
    ignorees: r.ignored,
    rejetees: r.rejected,
    rejeux: r.replays,
    debut: r.started_at,
    fin: r.finished_at,
    dernier_lot: r.batch_at,
    csv_secours: r.csv_url ? { url: r.csv_url, nom: r.csv_name } : null,
    message: r.message,
    stats: r.stats,
    notifie_le: r.notified_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function GET(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const params = new URL(req.url).searchParams;
  const runId = params.get("run_id")?.trim() || null;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20));
  const admin = createAdminClient();
  let q = admin.from("veille_runs").select(COLS).eq("org_id", auth.org.id).order("created_at", { ascending: false }).limit(limit);
  if (runId) q = q.eq("run_id", runId);
  const { data, error } = await q;
  if (error) {
    console.error("[veille/runs]", error.message);
    return jsonError(500, "Erreur serveur");
  }
  return jsonOk({ nombre: (data ?? []).length, runs: (data ?? []).map((r) => toApi(r as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const body = await readJson(req);
  if (body === null) return jsonError(400, "Corps JSON invalide");

  const parsed = runSchema.safeParse(normalizeRunBody(body));
  if (!parsed.success) {
    return jsonError(422, "Exécution refusée : champs invalides", {
      erreurs: parsed.error.issues.map((i) => ({ champ: i.path.map(String).join(".") || "(run)", message: i.message })),
    });
  }
  const d = parsed.data;
  const admin = createAdminClient();
  const { data: existing } = await admin.from("veille_runs").select(COLS).eq("org_id", auth.org.id).eq("run_id", d.run_id).maybeSingle();

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: d.statut };
  if (d.debut) patch.started_at = new Date(d.debut).toISOString();
  else if (!existing?.started_at) patch.started_at = now;
  if (d.fin) patch.finished_at = new Date(d.fin).toISOString();
  else if (FINAL.has(d.statut) && !existing?.finished_at) patch.finished_at = now;
  if (d.message !== undefined) patch.message = d.message || null;
  if (d.stats !== undefined) patch.stats = d.stats;
  if (d.csv_secours !== undefined) {
    patch.csv_url = d.csv_secours?.url ?? null;
    patch.csv_name = d.csv_secours?.nom ?? null;
  }

  const { data, error } = existing
    ? await admin.from("veille_runs").update(patch).eq("org_id", auth.org.id).eq("run_id", d.run_id).select(COLS).single()
    : await admin.from("veille_runs").insert({ org_id: auth.org.id, run_id: d.run_id, ...patch }).select(COLS).single();
  if (error || !data) {
    console.error("[veille/runs]", error?.message ?? "réponse vide");
    return jsonError(500, "Erreur serveur : exécution non enregistrée");
  }

  let notification: "envoyee" | "non_envoyee" | "non_configuree" | "desactivee" | "deja_envoyee" | "sans_objet" = "sans_objet";
  if (FINAL.has(d.statut)) {
    if (d.notifier === false) notification = "desactivee";
    else if (data.notified_at && d.notifier !== true) notification = "deja_envoyee";
    else notification = await notifyVeilleRun(admin, auth.org, data as unknown as RunRow);
  }
  return jsonOk({ action: existing ? "mise_a_jour" : "creee", notification, run: toApi(data as Record<string, unknown>) }, existing ? 200 : 201);
}

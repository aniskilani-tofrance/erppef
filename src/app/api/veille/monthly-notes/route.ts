import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateVeille, jsonError, jsonOk, readJson } from "@/lib/veille/auth";
import { monthlyNoteSchema, normalizeMonthlyNoteBody } from "@/lib/veille/schema";

// Notes mensuelles de veille : une par mois et par organisation.
//   POST { mois: "AAAA-MM", titre?, contenu, run_id?, nb_fiches? } → création ou mise à jour (idempotent)
//   GET  ?mois=AAAA-MM (facultatif) → consultation
export const dynamic = "force-dynamic";

const COLS = "id, month, title, content, run_id, entries_count, created_at, updated_at";

function toApi(n: Record<string, unknown>) {
  return { id: n.id, mois: n.month, titre: n.title, contenu: n.content, run_id: n.run_id, nb_fiches: n.entries_count, created_at: n.created_at, updated_at: n.updated_at };
}

export async function GET(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const mois = new URL(req.url).searchParams.get("mois")?.trim() || null;
  const admin = createAdminClient();
  let q = admin.from("veille_monthly_notes").select(COLS).eq("org_id", auth.org.id).order("month", { ascending: false }).limit(24);
  if (mois) q = q.eq("month", mois);
  const { data, error } = await q;
  if (error) {
    console.error("[veille/monthly-notes]", error.message);
    return jsonError(500, "Erreur serveur");
  }
  return jsonOk({ nombre: (data ?? []).length, notes: (data ?? []).map((n) => toApi(n as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const body = await readJson(req);
  if (body === null) return jsonError(400, "Corps JSON invalide");

  const parsed = monthlyNoteSchema.safeParse(normalizeMonthlyNoteBody(body));
  if (!parsed.success) {
    return jsonError(422, "Note refusée : champs invalides", {
      erreurs: parsed.error.issues.map((i) => ({ champ: i.path.map(String).join(".") || "(note)", message: i.message })),
    });
  }
  const d = parsed.data;
  const admin = createAdminClient();
  const { data: existing } = await admin.from("veille_monthly_notes").select("id").eq("org_id", auth.org.id).eq("month", d.mois).maybeSingle();
  const row = {
    org_id: auth.org.id,
    month: d.mois,
    title: d.titre ?? `Veille Qualiopi — ${d.mois}`,
    content: d.contenu,
    run_id: d.run_id ?? null,
    entries_count: d.nb_fiches ?? null,
  };
  const { data, error } = await admin
    .from("veille_monthly_notes")
    .upsert(row, { onConflict: "org_id,month" })
    .select(COLS)
    .single();
  if (error || !data) {
    console.error("[veille/monthly-notes]", error?.message ?? "réponse vide");
    return jsonError(500, "Erreur serveur : note non enregistrée");
  }
  return jsonOk({ action: existing ? "mise_a_jour" : "creee", note: toApi(data as Record<string, unknown>) }, existing ? 200 : 201);
}

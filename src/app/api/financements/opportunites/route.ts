import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateVeille, jsonError, jsonOk, readJson } from "@/lib/veille/auth";
import { parseIntParam } from "@/lib/veille/schema";
import { parseFrom, parseOpportuniteFields, OPPORTUNITE_FIELDS, toOpportunityRow, validateOpportunites } from "@/lib/financements/api";

// API du collecteur de veille des financements (modèle : /api/veille).
// Authentification : le même jeton de service (PEF_VEILLE_API_TOKEN), la même organisation
// (PEF_VEILLE_ORG_SLUG, défaut « pef »). Jamais le bac à sable par ce chemin.
export const dynamic = "force-dynamic";

// POST — dépôt d'une opportunité ou d'un lot.
//   • validation complète avant écriture (une invalide → 422, rien n'est écrit) ;
//   • idempotence : une dedupe_key déjà connue est ignorée, jamais modifiée (le tri fait
//     par l'équipe n'est pas écrasé) ; rejouer le même lot ne crée aucun doublon ;
//   • source = collecteur, statut = nouveau (« À trier » dans Ma semaine).
export async function POST(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);

  const body = await readJson(req);
  if (body === null) return jsonError(400, "Corps JSON invalide");

  const v = validateOpportunites(body);
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, erreur: v.erreur, recues: v.recues, creees: [], ignorees: [], rejetees: v.rejetees },
      { status: v.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  const { data: funders, error: fErr } = await admin.from("funders").select("id, code").eq("org_id", auth.org.id);
  if (fErr) {
    console.error("[financements/opportunites]", fErr.message);
    return jsonError(500, "Erreur serveur : aucune écriture effectuée");
  }
  const byCode = new Map((funders ?? []).map((f) => [String(f.code).toUpperCase(), f.id as string]));
  const rows = v.items.map((o) => toOpportunityRow(o, auth.org.id, byCode));

  // Un seul ordre d'insertion : tout ou rien. Les clés déjà présentes sont ignorées.
  const { data, error } = await admin
    .from("funding_opportunities")
    .upsert(rows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true })
    .select("id, dedupe_key");
  if (error) {
    console.error("[financements/opportunites]", error.message);
    return jsonError(500, "Erreur serveur : lot non enregistré (aucune écriture effectuée)", { recues: rows.length, creees: [], ignorees: [], rejetees: [] });
  }
  const created = (data ?? []).map((r) => ({ dedupe_key: r.dedupe_key as string, id: r.id as string }));
  const createdKeys = new Set(created.map((c) => c.dedupe_key));
  const ignorees = rows
    .filter((r) => !createdKeys.has(r.dedupe_key))
    .map((r) => ({ dedupe_key: r.dedupe_key, motif: "déjà connue (dedupe_key)" }));
  return jsonOk({ recues: rows.length, creees: created, ignorees, rejetees: [] });
}

// GET ?from=AAAA-MM-JJ&fields=dedupe_key,title,url&limit=500&offset=0 — sert à la
// déduplication côté collecteur (opportunités créées depuis « from », 90 jours par défaut).
export async function GET(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);

  const params = new URL(req.url).searchParams;
  const from = parseFrom(params.get("from"));
  if (!from.ok) return jsonError(400, from.erreur);
  const fields = parseOpportuniteFields(params.get("fields"));
  if (!fields.ok) {
    return jsonError(400, `Champs inconnus : ${fields.inconnus.join(", ")}. Champs possibles : ${OPPORTUNITE_FIELDS.join(", ")}`);
  }
  const limit = parseIntParam(params.get("limit"), 500, 1, 1000);
  const offset = parseIntParam(params.get("offset"), 0, 0, 1_000_000);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("funding_opportunities")
    .select([...new Set(["id", ...fields.fields])].join(", "))
    .eq("org_id", auth.org.id)
    .gte("created_at", from.fromIso)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[financements/opportunites]", error.message);
    return jsonError(500, "Erreur serveur");
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const opportunites = rows.map((row) => Object.fromEntries(fields.fields.map((f) => [f, row[f] ?? null])));
  return jsonOk({ from: from.from, champs: fields.fields, nombre: opportunites.length, limite: limit, decalage: offset, opportunites });
}

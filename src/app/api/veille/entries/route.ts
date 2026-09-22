import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateVeille, jsonError, jsonOk } from "@/lib/veille/auth";
import { ENTRY_FIELDS, parseFields, parseFromDate, parseIntParam } from "@/lib/veille/schema";

// GET /api/veille/entries?from=AAAA-MM-JJ&fields=dedupe_key,titre,url&limit=500&offset=0
// Liste les entrées du registre depuis une date (date de collecte pour le collecteur,
// date de l'entrée pour les saisies manuelles) — sert à la déduplication côté collecteur.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateVeille(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);

  const params = new URL(req.url).searchParams;
  const from = parseFromDate(params.get("from"));
  if (!from.ok) return jsonError(400, from.erreur);
  const fields = parseFields(params.get("fields"));
  if (!fields.ok) return jsonError(400, `Champs inconnus : ${fields.inconnus.join(", ")}. Champs possibles : ${Object.keys(ENTRY_FIELDS).join(", ")}`);
  const limit = parseIntParam(params.get("limit"), 500, 1, 1000);
  const offset = parseIntParam(params.get("offset"), 0, 0, 1_000_000);

  const columns = [...new Set(["id", ...fields.fields.map((f) => ENTRY_FIELDS[f])])].join(", ");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("watch_entries")
    .select(columns)
    .eq("org_id", auth.org.id)
    .gte("entry_date", from.from)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[veille/entries]", error.message);
    return jsonError(500, "Erreur serveur");
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const entries = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields.fields) out[f] = row[ENTRY_FIELDS[f]] ?? null;
    return out;
  });
  return jsonOk({ from: from.from, champs: fields.fields, nombre: entries.length, limite: limit, decalage: offset, entries });
}

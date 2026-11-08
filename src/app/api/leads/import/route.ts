import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateLeadsApi } from "@/lib/leads/api-auth";
import { apiImportSchema, runImport } from "@/lib/leads/api-import";
import { jsonError, jsonOk, readJson } from "@/lib/veille/auth";

// POST /api/leads/import — import en lot, idempotent (dédoublonnage par SIREN puis téléphone).
// Corps : { cible?: "leads" | "prospection", liste?, campagne?, simulation?, lignes?: [...] | texte?: "TSV" }.
// Source toujours « prospection » (aucun envoi automatique), organisation de production uniquement.
// Voir docs/integrations/api-leads.md.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await authenticateLeadsApi(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const raw = await readJson(req);
  if (raw === null) return jsonError(400, "Corps JSON attendu");
  const parsed = apiImportSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Corps invalide", { details: parsed.error.issues.slice(0, 10).map((i) => ({ champ: i.path.join("."), erreur: i.message })) });
  }
  try {
    const result = await runImport(createAdminClient(), auth.org.id, parsed.data);
    return jsonOk({ organisation: auth.org.name, ...result }, result.simulation || result.crees === 0 ? 200 : 201);
  } catch (e) {
    // Les fiches déjà créées restent ; relancer le même import ne crée que les manquantes.
    console.error("[api/leads/import]", e instanceof Error ? e.message : e);
    return jsonError(500, "Import interrompu : relancez le même import, les fiches déjà créées seront reconnues");
  }
}

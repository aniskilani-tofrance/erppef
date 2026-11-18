import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadRuptures, rupturesCsv, schoolYearStart } from "@/lib/parcours/registre";

// Registre des ruptures de parcours en tableur (page Qualité → « Exporter ») : abandons depuis
// ?depuis=AAAA-MM-JJ (par défaut le 1er septembre de l'année de formation en cours).
export async function GET(request: Request) {
  const { orgId } = await requireRole(["admin", "coordinator"]);
  const raw = new URL(request.url).searchParams.get("depuis");
  const since = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : schoolYearStart();
  const { rows } = await loadRuptures(await createClient(), orgId, since);
  return new Response(rupturesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ruptures-de-parcours_depuis-${since}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

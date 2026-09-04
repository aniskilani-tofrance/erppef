// Enrichissement QPV automatique des lignes importées (import manuel + synchro Drive).
// SERVEUR UNIQUEMENT (charge les périmètres ANCT ~2 Mo) — ne pas importer côté client.
// Best-effort : budget de temps global, les lignes non traitées restent « non renseigné »
// (détectables ensuite par le bouton de la fiche).
import { lookupQpv } from "@/lib/geo/qpv";
import type { ImportRow } from "@/lib/learner-import";

export async function enrichRowsWithQpv(rows: ImportRow[], budgetMs = 8000): Promise<number> {
  const deadline = Date.now() + budgetMs;
  const candidates = rows.filter((r) => r.qpv == null && r.address && (r.city || r.postalCode));
  let enriched = 0;

  const CONCURRENCY = 6;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (Date.now() > deadline) break;
    await Promise.all(
      candidates.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          const result = await lookupQpv(row.address!, row.city ?? "", row.postalCode ?? "");
          if (result.ok) {
            row.qpv = result.qpv;
            enriched += 1;
          }
        } catch {
          // adresse introuvable ou BAN indisponible : on laisse « non renseigné »
        }
      }),
    );
  }
  return enriched;
}

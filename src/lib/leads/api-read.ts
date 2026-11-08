// Lecture par l'API (GET /api/leads) : fiches modifiées depuis une date, page par page.
// Sert aux agents du QG (« quoi de neuf dans les leads depuis hier ? ») et aux scripts de
// synchronisation. Lecture seule, organisation de production uniquement.

export const LEAD_API_COLUMNS = [
  "id", "lead_no", "received_at", "source", "campaign", "company", "segment", "contact_name", "contact_role",
  "phone", "email", "city", "postal_code", "status", "lost_reason", "score", "offer", "attempts",
  "first_contact_at", "last_contact_at", "next_action", "next_action_on", "rdv_at", "rdv_mode", "rdv_outcome",
  "notes", "created_at", "updated_at",
].join(", ");

export const PROSPECT_API_COLUMNS = [
  "id", "list_id", "company", "legal_name", "segment", "siret", "address", "postal_code", "city", "phone", "email",
  "status", "attempts", "last_call_at", "callback_on", "callback_note", "lead_id", "notes", "created_at", "updated_at",
].join(", ");

export type ReadParams = { cible: "leads" | "prospection"; depuis: string; limite: number; decalage: number; evenements: boolean };

/** Lit et contrôle les paramètres. `depuis` : date (AAAA-MM-JJ, minuit à Paris) ou horodatage ISO. */
export function parseReadParams(params: URLSearchParams): { ok: true; value: ReadParams } | { ok: false; erreur: string } {
  const cibleRaw = params.get("cible") ?? "leads";
  if (cibleRaw !== "leads" && cibleRaw !== "prospection") return { ok: false, erreur: "« cible » vaut leads ou prospection" };
  const raw = (params.get("depuis") ?? "").trim();
  if (!raw) return { ok: false, erreur: "Paramètre « depuis » obligatoire (AAAA-MM-JJ ou date ISO)" };
  let depuis: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const t = Date.parse(`${raw}T00:00:00+01:00`);
    if (Number.isNaN(t)) return { ok: false, erreur: "« depuis » illisible" };
    depuis = new Date(t).toISOString();
  } else {
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return { ok: false, erreur: "« depuis » illisible (AAAA-MM-JJ ou date ISO)" };
    depuis = new Date(t).toISOString();
  }
  const int = (name: string, def: number, min: number, max: number) => {
    const n = Number.parseInt(params.get(name) ?? "", 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    ok: true,
    value: {
      cible: cibleRaw,
      depuis,
      limite: int("limite", 200, 1, 500),
      decalage: int("decalage", 0, 0, 1_000_000),
      evenements: ["1", "oui", "true"].includes((params.get("evenements") ?? "").toLowerCase()),
    },
  };
}

import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateLeadsApi } from "@/lib/leads/api-auth";
import { LEAD_API_COLUMNS, PROSPECT_API_COLUMNS, parseReadParams } from "@/lib/leads/api-read";
import { leadRef } from "@/lib/leads/status";
import { jsonError, jsonOk } from "@/lib/veille/auth";

// GET /api/leads?depuis=2026-11-04[&cible=leads|prospection][&limite=200][&decalage=0][&evenements=1]
// Fiches modifiées depuis « depuis » (les plus anciennes d'abord), organisation de production.
// Jeton : Authorization: Bearer $PEF_LEADS_API_TOKEN. Voir docs/integrations/api-leads.md.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateLeadsApi(req);
  if (!auth.ok) return jsonError(auth.status, auth.erreur);
  const parsed = parseReadParams(new URL(req.url).searchParams);
  if (!parsed.ok) return jsonError(400, parsed.erreur);
  const p = parsed.value;
  const admin = createAdminClient();
  const orgId = auth.org.id;

  if (p.cible === "prospection") {
    const { data, error } = await admin
      .from("prospects")
      .select(PROSPECT_API_COLUMNS)
      .eq("org_id", orgId)
      .gte("updated_at", p.depuis)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(p.decalage, p.decalage + p.limite - 1);
    if (error) {
      console.error("[api/leads] prospects", error.message);
      return jsonError(500, "Erreur serveur");
    }
    const prospects = (data ?? []) as unknown as Record<string, unknown>[];
    let appels: Record<string, unknown>[] = [];
    if (p.evenements && prospects.length) {
      const r = await admin
        .from("prospect_calls")
        .select("prospect_id, at, outcome, note")
        .eq("org_id", orgId)
        .in("prospect_id", prospects.map((x) => x.id as string))
        .gte("at", p.depuis)
        .order("at", { ascending: true });
      appels = (r.data ?? []) as Record<string, unknown>[];
    }
    return jsonOk({ cible: p.cible, organisation: auth.org.name, depuis: p.depuis, nombre: prospects.length, limite: p.limite, decalage: p.decalage, prospects, ...(p.evenements ? { appels } : {}) });
  }

  const { data, error } = await admin
    .from("employer_leads")
    .select(LEAD_API_COLUMNS)
    .eq("org_id", orgId)
    .gte("updated_at", p.depuis)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .range(p.decalage, p.decalage + p.limite - 1);
  if (error) {
    console.error("[api/leads] leads", error.message);
    return jsonError(500, "Erreur serveur");
  }
  const leads: Record<string, unknown>[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({ ref: leadRef(l.lead_no as number | null), ...l }));
  let evenements: Record<string, unknown>[] = [];
  if (p.evenements && leads.length) {
    const r = await admin
      .from("employer_lead_events")
      .select("lead_id, at, kind, outcome, note")
      .eq("org_id", orgId)
      .in("lead_id", leads.map((x) => x.id as string))
      .gte("at", p.depuis)
      .order("at", { ascending: true });
    evenements = (r.data ?? []) as Record<string, unknown>[];
  }
  return jsonOk({ cible: p.cible, organisation: auth.org.name, depuis: p.depuis, nombre: leads.length, limite: p.limite, decalage: p.decalage, leads, ...(p.evenements ? { evenements } : {}) });
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Lecture partagée du module Prospection (pages, dashboard setter). Serveur uniquement.

export type ProspectRow = {
  id: string;
  list_id: string;
  company: string;
  legal_name: string | null;
  segment: string;
  siret: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  department: string | null;
  opened_on: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contact_source: string | null;
  status: string;
  attempts: number;
  last_call_at: string | null;
  callback_on: string | null;
  callback_note: string | null;
  lead_id: string | null;
  notes: string | null;
  owner_user_id: string | null;
};

export const PROSPECT_COLUMNS =
  "id, list_id, company, legal_name, segment, siret, address, postal_code, city, department, opened_on, phone, email, website, " +
  "contact_source, status, attempts, last_call_at, callback_on, callback_note, lead_id, notes, owner_user_id";

// Une liste peut dépasser les 1 000 lignes qu'une requête renvoie : lecture par pages.
export async function loadProspects(
  supabase: SupabaseClient,
  filter: { listId?: string; openOnly?: boolean } = {},
): Promise<ProspectRow[]> {
  const out: ProspectRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("prospects").select(PROSPECT_COLUMNS).order("created_at").range(from, from + 999);
    if (filter.listId) q = q.eq("list_id", filter.listId);
    if (filter.openOnly) q = q.in("status", ["a_appeler", "pas_joint", "barrage", "rappeler"]);
    const { data } = await q;
    const rows = (data ?? []) as unknown as ProspectRow[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export type ProspectCallRow = {
  id: string;
  prospect_id: string;
  at: string;
  outcome: string;
  note: string | null;
  by_user_id: string | null;
};

export type ProspectListRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

// Recherche Google Maps du restaurant : 20 secondes pour trouver le numéro ou le gérant.
export function mapsSearchUrl(p: Pick<ProspectRow, "company" | "address" | "postal_code" | "city">): string {
  const q = [p.company, p.address, p.postal_code, p.city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

export function annuaireUrl(siret: string | null): string | null {
  return siret ? `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}` : null;
}

export function frDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentContactRow = {
  id: string;
  learner_id: string;
  contacted_at: string;
  channel: string;
  outcome: string;
  note: string | null;
  reason: string | null;
  by_name: string | null;
  last_contact_at: string | null; // dernier VRAI contact de la personne (hors notes internes)
};

const PAGE = 1000; // plafond de lignes par requête de l'API Supabase

// Les 5 dernières lignes du journal de chaque apprenant (vue learner_contacts_recent),
// lues page par page : avec 5 lignes par personne, on dépasse vite le plafond de l'API.
// Serveur uniquement.
export async function loadRecentContacts(supabase: SupabaseClient): Promise<RecentContactRow[]> {
  const rows: RecentContactRow[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("learner_contacts_recent")
      .select("id, learner_id, contacted_at, channel, outcome, note, reason, by_name, last_contact_at")
      .order("contacted_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as RecentContactRow[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

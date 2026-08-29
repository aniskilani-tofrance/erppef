"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Recherche globale ⌘K : apprenants, groupes, formateurs, salles en une frappe.
// RLS active (client utilisateur) — chacun ne voit que son organisation.

export type SearchHit = {
  kind: "apprenant" | "groupe" | "formateur" | "salle";
  label: string;
  sublabel: string | null;
  href: string;
};

export async function searchGlobal(rawQuery: string): Promise<SearchHit[]> {
  const parsed = z.string().min(2).max(80).safeParse(rawQuery.trim());
  if (!parsed.success) return [];
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  // Échappement des jokers PostgREST
  const q = `%${parsed.data.replace(/[%_]/g, "\\$&")}%`;

  const [learners, groups, trainers, rooms] = await Promise.all([
    supabase
      .from("learners")
      .select("id, first_name, last_name, phone")
      .or(`first_name.ilike.${q},last_name.ilike.${q},phone.ilike.${q}`)
      .limit(6),
    supabase.from("groups").select("id, name, status").ilike("name", q).limit(6),
    supabase
      .from("trainers")
      .select("id, first_name, last_name")
      .or(`first_name.ilike.${q},last_name.ilike.${q}`)
      .limit(4),
    supabase.from("rooms").select("id, name").ilike("name", q).limit(4),
  ]);

  const hits: SearchHit[] = [];
  for (const l of learners.data ?? []) {
    hits.push({
      kind: "apprenant",
      label: `${l.first_name} ${l.last_name}`,
      sublabel: l.phone,
      href: `/apprenants?q=${encodeURIComponent(`${l.first_name} ${l.last_name}`)}`,
    });
  }
  for (const g of groups.data ?? []) {
    hits.push({ kind: "groupe", label: g.name, sublabel: g.status, href: `/groupes/${g.id}` });
  }
  for (const t of trainers.data ?? []) {
    hits.push({
      kind: "formateur",
      label: `${t.first_name} ${t.last_name ?? ""}`.trim(),
      sublabel: null,
      href: `/formateurs/${t.id}`,
    });
  }
  for (const r of rooms.data ?? []) {
    hits.push({ kind: "salle", label: r.name, sublabel: null, href: "/salles" });
  }
  return hits;
}

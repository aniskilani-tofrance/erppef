import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Les points d'entrée externes du module Leads (formulaire, Calendly, retours Brevo)
// s'authentifient tous par le jeton de l'organisation (Leads → Réglages), passé dans
// l'adresse ou dans un en-tête. Pas de session utilisateur : le jeton désigne l'organisme.

export type LeadsWebhookOrg = { id: string; name: string; settings: unknown };

export function leadsTokenOf(req: NextRequest): string | null {
  const q = req.nextUrl.searchParams.get("token");
  if (q) return q;
  const h = req.headers.get("x-leads-token");
  if (h) return h;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function findOrgByLeadsToken(token: string | null): Promise<LeadsWebhookOrg | null> {
  if (!token || token.length < 16) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("id, name, settings").eq("settings->leads->>inboundToken", token).maybeSingle();
  return (data as LeadsWebhookOrg | null) ?? null;
}

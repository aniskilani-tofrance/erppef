import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Authentification de l'API de veille : un jeton de service unique (variable
// d'environnement PEF_VEILLE_API_TOKEN), présenté en « Authorization: Bearer … ».
// Le jeton n'est ni journalisé, ni renvoyé, ni stocké en base. La comparaison se fait
// sur des empreintes SHA-256 de même longueur (pas de fuite par le temps de réponse).
// Le jeton ne donne accès qu'aux routes /api/veille/* de l'organisation désignée par
// PEF_VEILLE_ORG_SLUG (défaut : pef) — rien d'autre dans l'ERP.

export function bearerOf(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

export function tokenMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected || expected.length < 16) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type VeilleOrg = { id: string; name: string };
export type VeilleAuth =
  | { ok: true; org: VeilleOrg }
  | { ok: false; status: 401 | 503; erreur: string };

export async function authenticateVeille(req: Request): Promise<VeilleAuth> {
  const expected = process.env.PEF_VEILLE_API_TOKEN;
  if (!expected) return { ok: false, status: 503, erreur: "API de veille non configurée côté serveur (jeton absent)" };
  if (!tokenMatches(bearerOf(req), expected)) return { ok: false, status: 401, erreur: "Jeton manquant ou invalide" };

  const slug = process.env.PEF_VEILLE_ORG_SLUG ?? "pef";
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("id, name").eq("slug", slug).maybeSingle();
  if (!data) return { ok: false, status: 503, erreur: "Organisation de veille introuvable" };
  return { ok: true, org: { id: data.id, name: data.name } };
}

export function jsonError(status: number, erreur: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, erreur, ...(extra ?? {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...body }, { status, headers: { "Cache-Control": "no-store" } });
}

// Corps JSON ou null si illisible (jamais de détail du corps dans les journaux).
export async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

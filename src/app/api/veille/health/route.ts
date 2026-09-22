import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerOf, tokenMatches } from "@/lib/veille/auth";
import { VEILLE_API_VERSION } from "@/lib/veille/schema";

// GET /api/veille/health — état du service, sans aucune donnée métier.
// Sans jeton : { auth: "absent" }. Avec jeton : "ok" ou "invalide", et un ping de la base.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.PEF_VEILLE_API_TOKEN;
  const provided = bearerOf(req);
  const auth = !expected ? "non_configuree" : !provided ? "absent" : tokenMatches(provided, expected) ? "ok" : "invalide";
  const body: Record<string, unknown> = {
    ok: true,
    service: "pef-erp-veille",
    version: VEILLE_API_VERSION,
    horodatage: new Date().toISOString(),
    base_url: process.env.PEF_VEILLE_API_URL ?? null,
    auth,
  };
  if (auth === "ok") {
    const admin = createAdminClient();
    const { error } = await admin.from("organizations").select("id", { count: "exact", head: true });
    body.base_de_donnees = error ? "erreur" : "ok";
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

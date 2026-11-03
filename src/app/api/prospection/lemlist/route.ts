import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lemlistUnsubscribe, parseLemlistEvent, secretMatches } from "@/lib/prospection/lemlist";
import { applyLemlistEvent, supabaseLemlistStore } from "@/lib/prospection/lemlist-bridge";

// Webhook lemlist → ERP (prospection sortante). Voir docs/integrations/lemlist-prospection.md.
// lemlist renvoie dans chaque appel le « secret » choisi à la création du webhook : on le compare à
// LEMLIST_WEBHOOK_SECRET. L'organisation est fixée par LEMLIST_ORG_ID (la SASU), jamais par le corps.
// Variables : LEMLIST_WEBHOOK_SECRET, LEMLIST_ORG_ID, LEMLIST_API_KEY (liste de blocage), LEMLIST_CAMPAGNE.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function config() {
  const secret = process.env.LEMLIST_WEBHOOK_SECRET ?? "";
  const orgId = process.env.LEMLIST_ORG_ID ?? "";
  return secret.length >= 16 && UUID.test(orgId) ? { secret, orgId } : null;
}

export async function GET() {
  return NextResponse.json({ ok: Boolean(config()), message: config() ? "Webhook lemlist prêt." : "Webhook lemlist non configuré." });
}

export async function POST(req: NextRequest) {
  const cfg = config();
  if (!cfg) return NextResponse.json({ ok: false, error: "Webhook lemlist non configuré" }, { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON attendu" }, { status: 400 });
  }
  const event = parseLemlistEvent(body);
  const received = event?.secret ?? req.headers.get("x-lemlist-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!secretMatches(received, cfg.secret)) return NextResponse.json({ ok: false, error: "Secret invalide" }, { status: 401 });
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  try {
    const result = await applyLemlistEvent(supabaseLemlistStore(createAdminClient()), cfg.orgId, event, {
      unsubscribe: (values) => lemlistUnsubscribe(values),
    });
    if (result.blocklist?.failed.length) {
      console.error("[lemlist] liste de blocage incomplète", { echecs: result.blocklist.failed.length, raison: result.blocklist.skipped ?? "api" });
    }
    return NextResponse.json({ ok: true, ...result, blocklist: result.blocklist ? { done: result.blocklist.done.length, failed: result.blocklist.failed.length, skipped: result.blocklist.skipped } : undefined });
  } catch (e) {
    // 500 : lemlist réessaiera ; le repère [lemlist act_…] évite tout double traitement.
    console.error("[lemlist] événement non appliqué", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Erreur" }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productionOrg } from "@/lib/leads/api-auth";
import { lemlistUnsubscribe, parseLemlistEvent, secretMatches } from "@/lib/prospection/lemlist";
import { applyLemlistEvent, supabaseLemlistStore } from "@/lib/prospection/lemlist-bridge";

// Webhook lemlist → ERP (prospection sortante), servi à deux adresses :
//   POST /api/leads/lemlist-webhook   (adresse à donner à lemlist)
//   POST /api/prospection/lemlist     (première adresse, gardée)
// Voir docs/integrations/lemlist-prospection.md.
//
// Secret : LEMLIST_WEBHOOK_SECRET (au moins 16 caractères), reçu dans le corps (« secret »),
// l'en-tête x-lemlist-secret ou le paramètre ?secret= de l'adresse (le connecteur lemlist ne
// permet pas de fixer un secret dans le corps : on le met dans l'adresse du webhook).
// Organisation : TOUJOURS la production (ORG_PEF), jamais le bac à sable ni le corps de la requête.

function secretConfigured(): string | null {
  const secret = process.env.LEMLIST_WEBHOOK_SECRET ?? "";
  return secret.length >= 16 ? secret : null;
}

export function lemlistWebhookGet() {
  const ok = Boolean(secretConfigured());
  return NextResponse.json({ ok, message: ok ? "Webhook lemlist prêt." : "Webhook lemlist non configuré." });
}

export async function lemlistWebhookPost(req: NextRequest) {
  const secret = secretConfigured();
  if (!secret) return NextResponse.json({ ok: false, error: "Webhook lemlist non configuré" }, { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON attendu" }, { status: 400 });
  }
  const event = parseLemlistEvent(body);
  const received = event?.secret ?? req.headers.get("x-lemlist-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!secretMatches(received, secret)) return NextResponse.json({ ok: false, error: "Secret invalide" }, { status: 401 });
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  const org = await productionOrg();
  if (!org) return NextResponse.json({ ok: false, error: "Organisation de production introuvable" }, { status: 503 });

  try {
    const result = await applyLemlistEvent(supabaseLemlistStore(createAdminClient()), org.id, event, {
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

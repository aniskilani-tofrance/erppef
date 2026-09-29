import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrgByLeadsToken, leadsTokenOf } from "@/lib/leads/webhook-auth";
import { parseBrevoWebhook } from "@/lib/leads/brevo-webhook";
import { handleBrevoEvent } from "@/lib/leads/brevo-webhook-handler";

// Retours Brevo sur les e-mails transactionnels : POST /api/leads/brevo-webhook?token=<jeton>
//
// À configurer une fois dans Brevo (Transactionnel → Paramètres → Webhooks) avec les
// événements délivré, bounce doux, bounce dur, bloqué, adresse invalide, désinscription
// et plainte. Chaque retour est conservé dans employer_lead_email_events ; les quatre
// familles qui comptent (délivré, bounce, désinscription, plainte) remontent sur la
// fiche, s'écrivent dans son journal et arrêtent la séquence quand l'adresse ne doit
// plus rien recevoir. La réponse est toujours 200 quand le jeton est bon : Brevo réessaie
// sur toute autre réponse, et un retour illisible n'a pas besoin d'être rejoué.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const org = await findOrgByLeadsToken(leadsTokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    organisation: org.name,
    message: "Point d'entrée des retours Brevo actif : déclarez cette adresse comme webhook transactionnel (POST).",
  });
}

export async function POST(req: NextRequest) {
  const org = await findOrgByLeadsToken(leadsTokenOf(req));
  if (!org) return NextResponse.json({ ok: false, error: "Jeton invalide" }, { status: 401 });
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, traites: 0, ignore: "corps illisible" });
  }
  const events = parseBrevoWebhook(body);
  const admin = createAdminClient();
  const details: unknown[] = [];
  for (const ev of events) {
    try {
      details.push(await handleBrevoEvent(admin, org.id, ev));
    } catch (e) {
      console.error("[brevo-webhook]", e instanceof Error ? e.message : e);
      details.push({ event: ev.event, ok: false });
    }
  }
  return NextResponse.json({ ok: true, traites: details.length, details });
}

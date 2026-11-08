import type { NextRequest } from "next/server";
import { lemlistWebhookGet, lemlistWebhookPost } from "@/lib/prospection/lemlist-webhook";

// Webhook lemlist → ERP : réponses, intéressé / pas intéressé, RDV pris (lemcal),
// désinscriptions (→ opposition), rebonds. Voir docs/integrations/lemlist-prospection.md.
export const dynamic = "force-dynamic";

export async function GET() {
  return lemlistWebhookGet();
}

export async function POST(req: NextRequest) {
  return lemlistWebhookPost(req);
}

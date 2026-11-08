import type { NextRequest } from "next/server";
import { lemlistWebhookGet, lemlistWebhookPost } from "@/lib/prospection/lemlist-webhook";

// Première adresse du webhook lemlist, gardée : même traitement que /api/leads/lemlist-webhook.
export const dynamic = "force-dynamic";

export async function GET() {
  return lemlistWebhookGet();
}

export async function POST(req: NextRequest) {
  return lemlistWebhookPost(req);
}

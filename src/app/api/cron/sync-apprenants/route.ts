import { syncLearnersFromDrive } from "@/lib/drive-sync";

export const maxDuration = 60; // géocodage QPV des nouvelles lignes

// Synchronisation quotidienne du fichier partagé « Apprenant ERPPEF » (Google Drive)
// vers la liste des apprenants. Voir src/lib/drive-sync.ts.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await syncLearnersFromDrive();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

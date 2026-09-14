import { runWeeklyAttendanceDispatch } from "@/lib/emargement/dispatch";

export const maxDuration = 300; // une feuille PDF par séance, plusieurs groupes

// Cron Vercel du vendredi après-midi (cf. vercel.json, 14 h UTC = 16 h à Paris l'été, 15 h
// l'hiver) : envoie au financeur les feuilles d'émargement clôturées de la semaine pour
// chaque groupe dont l'envoi hebdomadaire est actif (fiche groupe → « Feuilles d'émargement
// au financeur »). Authentifié par le header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const summary = await runWeeklyAttendanceDispatch();
  return Response.json(summary);
}

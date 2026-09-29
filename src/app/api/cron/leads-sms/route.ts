import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeferredLeadSms, sendLeadRdvSms, sendPendingLeadIntro } from "@/lib/leads/automations";
import { runDueLeadSequences, scheduleUpcomingAppointmentReminders } from "@/lib/leads/sequence-engine";

// L'horloge du module Leads : SMS transactionnels (rappel de la veille, reprises), étapes
// échues des séquences automatiques (injoignable, rendez-vous manqué, proposition, veille),
// et programmation des rappels Brevo J-1 / H-2 des créneaux qui entrent dans la fenêtre
// de 72 heures.
//
// Les envois immédiats ne passent pas par ici : ils partent dans la seconde depuis le
// point d'entrée des leads, sans restriction horaire. Cette route couvre les deux cas
// qui demandent une horloge : le rappel de la veille pour les rendez-vous du lendemain,
// et le rattrapage d'un message qu'une panne de Twilio ou une configuration absente
// aurait empêché de partir. Elle tourne tous les quarts d'heure sur Vercel, doublée
// toutes les deux heures par une action GitHub indépendante de la plateforme.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  let invitations = { sent: 0, skipped: 0 };
  let rappelsRdv = { sent: 0, skipped: 0 };
  let reprises = { sent: 0, skipped: 0 };
  let sequences = { executed: 0, stopped: 0, skipped: 0, failed: 0 };
  let rappelsBrevo = { scheduled: 0, leads: 0 };

  try {
    invitations = await sendPendingLeadIntro(supabase);
  } catch (e) {
    console.error("[leads/invitation]", e instanceof Error ? e.message : e);
  }

  try {
    rappelsRdv = await sendLeadRdvSms(supabase);
  } catch (e) {
    console.error("[leads/sms rappel rdv]", e instanceof Error ? e.message : e);
  }
  try {
    reprises = await sendDeferredLeadSms(supabase);
  } catch (e) {
    console.error("[leads/sms reprise]", e instanceof Error ? e.message : e);
  }
  try {
    sequences = await runDueLeadSequences(supabase);
  } catch (e) {
    console.error("[leads/sequences]", e instanceof Error ? e.message : e);
  }
  try {
    rappelsBrevo = await scheduleUpcomingAppointmentReminders(supabase);
  } catch (e) {
    console.error("[leads/rappels brevo]", e instanceof Error ? e.message : e);
  }

  return Response.json({ ok: true, invitations, rappelsRdv, reprises, sequences, rappelsBrevo });
}

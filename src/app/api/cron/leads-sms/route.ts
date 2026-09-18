import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeferredLeadSms, sendLeadRdvSms } from "@/lib/leads/automations";

// SMS transactionnels aux restaurateurs : rappel de rendez-vous de la veille, et reprise
// des messages qui n'ont pas pu partir dans la plage autorisée.
//
// Pourquoi une route séparée du cron des alertes : celui-ci tourne à 05h30 UTC, soit
// 07h30 à Paris en été et 06h30 en hiver — dans les deux cas AVANT l'ouverture de la
// plage d'envoi de 08h00. Les SMS y étaient donc systématiquement refusés pour cause
// d'heure interdite, et la reprise ne rattrapait jamais rien. Cette route tourne à
// 07h15, 12h15 et 17h15 UTC, ce qui tombe à l'intérieur de la plage toute l'année,
// changement d'heure compris, et donne trois occasions de rattrapage par jour.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  let rappelsRdv = { sent: 0, skipped: 0 };
  let reprises = { sent: 0, skipped: 0 };

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

  return Response.json({ ok: true, rappelsRdv, reprises });
}

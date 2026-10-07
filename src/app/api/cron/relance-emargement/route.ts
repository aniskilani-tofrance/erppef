import { createAdminClient } from "@/lib/supabase/admin";
import { mailerConfigured } from "@/lib/mailer";
import { localToUtc, nextDay } from "@/lib/dates";
import { productionOrgIds } from "@/lib/production-orgs";
import { sendTrainerRelances } from "@/lib/emargement/relances";

// Cron Vercel du soir (cf. vercel.json, 17 h 30 UTC = 19 h 30 à Paris l'été, 18 h 30
// l'hiver), du lundi au samedi : chaque formatrice dont une séance du jour est terminée
// sans feuille d'émargement clôturée reçoit un email avec le lien direct. La relance du
// lendemain matin (cron « alertes ») reste le filet de sécurité. Jamais le bac à sable.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!mailerConfigured()) return Response.json({ sent: 0, reason: "email non configuré" });

  const supabase = createAdminClient();
  const orgIds = await productionOrgIds(supabase);
  const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // YYYY-MM-DD local

  const { data: unclosed, error } = await supabase
    .from("sessions")
    .select("id, starts_at, groups(name), trainers:trainer_id(first_name, email)")
    .in("org_id", orgIds)
    .neq("status", "annulee")
    .is("attendance_closed_at", null)
    .gte("starts_at", localToUtc(today, "00:00"))
    .lt("starts_at", localToUtc(nextDay(today), "00:00"))
    .lt("ends_at", new Date().toISOString())
    .order("starts_at");
  if (error) return Response.json({ sent: 0, error: error.message }, { status: 500 });

  const sent = await sendTrainerRelances(unclosed ?? [], "soir");
  return Response.json({ sent, unclosed: (unclosed ?? []).length });
}

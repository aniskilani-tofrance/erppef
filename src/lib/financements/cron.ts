import type { SupabaseClient } from "@supabase/supabase-js";
import type { Family } from "./constants";
import { addDays, parisDay } from "./echeances";
import {
  deadlinesToRemind,
  financementsAlertLines,
  financementsMailHtml,
  financementsMailSubject,
  isMondayParis,
  teamRecipients,
  type ReminderDeadline,
} from "./rappels";
import { mailerConfigured, sendMail } from "@/lib/mailer";

// Le même bloc, envoyé par e-mail aux comptes administration et coordination de chaque
// organisation réelle : le résumé du matin ne part qu'à une adresse (ALERTS_EMAIL), la
// coordinatrice ne le reçoit pas. L'adresse du résumé est retirée (pas de doublon).
// `supabase` doit être le client de service (lecture des adresses des comptes).
export async function sendFinancementsReminders(supabase: SupabaseClient, orgIds: string[], now: Date = new Date()): Promise<number> {
  if (!orgIds.length || !mailerConfigured()) return 0;
  const { data: members, error } = await supabase
    .from("memberships")
    .select("org_id, user_id")
    .in("org_id", orgIds)
    .in("role", ["admin", "coordinator"]);
  if (error) throw new Error(`comptes : ${error.message}`);
  if (!members?.length) return 0;
  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? null]));

  let sent = 0;
  for (const orgId of orgIds) {
    const lines = await financementsAlerts(supabase, [orgId], now);
    if (!lines.length) continue;
    const to = teamRecipients(
      members.filter((m) => m.org_id === orgId).map((m) => emailById.get(m.user_id as string)),
      process.env.ALERTS_EMAIL,
    );
    for (const email of to) {
      if (await sendMail({ to: email, subject: financementsMailSubject(lines), html: financementsMailHtml(lines) })) sent++;
    }
  }
  return sent;
}

// Bloc « Financements » du résumé du matin (/api/cron/alertes). Lit UNIQUEMENT les
// organisations passées (productionOrgIds : jamais le bac à sable).
//  • échéances non faites à J-30, J-15, J-3 (ou les rappels propres à l'échéance) ;
//  • le lundi : les opportunités « nouveau » arrivées depuis 7 jours.
export async function financementsAlerts(supabase: SupabaseClient, orgIds: string[], now: Date = new Date()): Promise<string[]> {
  if (!orgIds.length) return [];
  const today = parisDay(now);
  // Fenêtre large (le plus grand rappel proposé est J-60) ; le tri fin est fait en Paris.
  const { data: deadlines, error } = await supabase
    .from("funding_deadlines")
    .select("id, kind, title, due_at, done_at, reminder_days, application_id, opportunity_id, funder_id, funders(name)")
    .in("org_id", orgIds)
    .is("done_at", null)
    .gte("due_at", `${addDays(today, -1)}T00:00:00Z`)
    .lte("due_at", `${addDays(today, 400)}T00:00:00Z`)
    .order("due_at");
  if (error) throw new Error(`échéances : ${error.message}`);

  const reminders = deadlinesToRemind(
    (deadlines ?? []).map((d) => ({
      ...(d as unknown as ReminderDeadline),
      funder_name: (d.funders as unknown as { name: string } | null)?.name ?? null,
    })),
    now,
  );

  const monday = isMondayParis(now);
  let fresh: { id: string; title: string; family: Family; deadline_at: string | null; funder_label: string | null }[] = [];
  if (monday) {
    const { data, error: oErr } = await supabase
      .from("funding_opportunities")
      .select("id, title, family, deadline_at, funder_name, funders(name)")
      .in("org_id", orgIds)
      .eq("watch_status", "nouveau")
      .gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
      .order("deadline_at", { ascending: true, nullsFirst: false });
    if (oErr) throw new Error(`opportunités : ${oErr.message}`);
    fresh = (data ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      family: o.family as Family,
      deadline_at: o.deadline_at,
      funder_label: (o.funders as unknown as { name: string } | null)?.name ?? o.funder_name ?? null,
    }));
  }

  return financementsAlertLines({ reminders, newOpportunities: fresh, monday });
}

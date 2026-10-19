"use server";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calendarsSharedWith, gcalConfigured, listOrgCalendars, type OrgCalendar } from "@/lib/gcal";

export type MyCalendarsResult = { ok: true; email: string; calendars: OrgCalendar[] } | { ok: false; error: string };

// « Mes agendas Google » (page Compte) : les agendas de l'ERP partagés avec l'adresse du
// compte connecté. Un agenda partagé n'apparaît pas tout seul dans Google Agenda (et
// Google n'envoie pas toujours l'email de partage) : le lien « cid » l'y ajoute.
export async function listMyGoogleCalendars(): Promise<MyCalendarsResult> {
  const { orgId } = await requireSession();
  if (!gcalConfigured()) return { ok: false, error: "Agendas Google non configurés sur l'ERP." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  try {
    const calendars = calendarsSharedWith(await listOrgCalendars(orgId), email).map((c) => ({ ...c, shares: [] }));
    return { ok: true, email, calendars };
  } catch (e) {
    return { ok: false, error: `Lecture des agendas impossible : ${e instanceof Error ? e.message : "erreur inconnue"}` };
  }
}

import type { calendar_v3 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { SANDBOX_SLUG } from "@/lib/production-orgs";
import { learnerRef } from "@/lib/refs";
import { formatPhone } from "@/lib/admission/phone";
import {
  appointmentKindLabel,
  appointmentModeLabel,
  appointmentPlace,
  appointmentStatusLabel,
} from "@/lib/admission/appointments";
import {
  ADMISSIONS_TAG,
  TZ,
  WRITE_PAUSE_MS,
  calendarClient,
  ensureCalendar,
  eventNeedsUpdate,
  gcalConfigured,
  listErpEvents,
  loadAdminEmails,
  sleep,
  statusOf,
  wantedShares,
  withRetry,
  type GcalSyncStats,
} from "@/lib/gcal";

// Rendez-vous d'admission → Google Agenda.
//
// Le compte de service ne peut ni écrire dans l'agenda personnel d'Anis ni inviter des
// participants (pas de délégation sur le domaine). Comme pour les cours, il possède donc
// UN agenda dédié par organisme, « Admissions PEF — Rendez-vous » (marqueur
// erp-admissions:<orgId> dans la description), partagé en écriture avec la direction
// et les coordinateurs (comptes ERP admin / coordinator + GCAL_ADMIN_EMAIL) : il apparaît
// dans Google Agenda à côté des agendas « Cours PEF ».
//
// Idempotence : id d'événement = uuid du RDV sans tirets, marqueur
// extendedProperties.private { erp: "pef", appointmentId }. Un RDV annulé (ou supprimé)
// voit son événement supprimé ; honoré / absent restent dans l'agenda (avec le résultat).
//
// Deux chemins d'écriture :
//  - immédiat, après chaque création / modification / annulation (after() de l'action) ;
//  - filet de sécurité, la passe nocturne sync-gcal : RDV des 7 derniers jours et à venir.
// L'état est noté sur le RDV (gcal_event_id, gcal_synced_at, gcal_error).

export const ADMISSIONS_CALENDAR_NAME = "Admissions PEF — Rendez-vous";
const ERP_URL = "https://pef-erp.vercel.app";
const LOOKBACK_DAYS = 7;

// ───────────────────────── Helpers purs (testés) ─────────────────────────

export type AppointmentForCalendar = {
  id: string;
  starts_at: string;
  ends_at: string;
  kind: string;
  mode: string;
  location: string | null;
  notes: string | null;
  status: string;
  learner: { first_name: string; last_name: string | null; learner_no: number | null; phone: string | null } | null;
};

export function admissionsCalendarTag(orgId: string): string {
  return `${ADMISSIONS_TAG}${orgId}`;
}

/** Id d'événement Google : uuid sans tirets (alphabet hex ⊂ base32hex accepté par Calendar). */
export function appointmentEventId(appointmentId: string): string {
  return appointmentId.replace(/-/g, "").toLowerCase();
}

function learnerName(a: AppointmentForCalendar): string {
  if (!a.learner) return "apprenant";
  return `${a.learner.first_name} ${a.learner.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

/** Lien vers la fiche dans l'ERP (recherche par référence A-xxxx, sinon par nom). */
export function learnerFicheUrl(a: AppointmentForCalendar): string {
  const ref = a.learner?.learner_no != null ? learnerRef(a.learner.learner_no) : null;
  return `${ERP_URL}/apprenants?q=${encodeURIComponent(ref ?? learnerName(a))}`;
}

/** Corps d'événement Google attendu pour un rendez-vous d'admission. */
export function appointmentEventBody(a: AppointmentForCalendar): calendar_v3.Schema$Event {
  const ref = a.learner?.learner_no != null ? ` (${learnerRef(a.learner.learner_no)})` : "";
  const prefix = a.kind === "diagnostic_tofrance" ? "Diagnostic ToFrance" : "RDV admission";
  const summary = `${prefix} · ${learnerName(a)}${ref}${a.kind === "test_oral" ? " · Test oral" : ""}`;
  const phone = a.learner?.phone?.trim() ? formatPhone(a.learner.phone) : null;
  const description = [
    a.kind === "diagnostic_tofrance"
      ? "Diagnostic partagé avec ToFrance (tofrance.life), posé dans l'ERP ParlerEmploi Formation."
      : "Rendez-vous d'admission posé dans l'ERP ParlerEmploi Formation.",
    `Type : ${appointmentKindLabel(a.kind)}`,
    `Mode : ${appointmentModeLabel(a.mode)}`,
    phone ? `Téléphone : ${phone}` : "Téléphone : non renseigné",
    a.notes?.trim() ? `Notes : ${a.notes.trim()}` : null,
    a.status !== "prevu" ? `Résultat : ${appointmentStatusLabel(a.status)}` : null,
    `Fiche ERP : ${learnerFicheUrl(a)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    summary,
    location: appointmentPlace(a.mode, a.location),
    description,
    status: "confirmed",
    start: { dateTime: a.starts_at, timeZone: TZ },
    end: { dateTime: a.ends_at, timeZone: TZ },
    extendedProperties: { private: { erp: "pef", appointmentId: a.id } },
  };
}

/** Faut-il un événement Google pour ce RDV ? (annulé = non) */
export function wantsEvent(status: string): boolean {
  return status !== "annule";
}

// ───────────────────────── Accès aux données ─────────────────────────

type AppointmentRow = {
  id: string;
  org_id: string;
  starts_at: string;
  ends_at: string;
  kind: string;
  mode: string;
  location: string | null;
  notes: string | null;
  status: string;
  gcal_event_id: string | null;
  gcal_error: string | null;
  learners: AppointmentForCalendar["learner"];
};

const ROW_SELECT =
  "id, org_id, starts_at, ends_at, kind, mode, location, notes, status, gcal_event_id, gcal_error, learners(first_name, last_name, learner_no, phone)";

function toCalendar(r: AppointmentRow): AppointmentForCalendar {
  return {
    id: r.id,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    kind: r.kind,
    mode: r.mode,
    location: r.location,
    notes: r.notes,
    status: r.status,
    learner: r.learners,
  };
}

async function recordState(
  appointmentId: string,
  state: { eventId: string | null; error: string | null },
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("admission_appointments")
    .update({
      gcal_event_id: state.eventId,
      gcal_error: state.error ? state.error.slice(0, 500) : null,
      gcal_synced_at: state.error ? undefined : new Date().toISOString(),
    })
    .eq("id", appointmentId);
}

function emptyStats(): GcalSyncStats {
  return { calendars: 0, upserted: 0, unchanged: 0, deleted: 0, renamed: 0, shared: 0, errors: [] };
}

async function admissionsCalendarId(cal: calendar_v3.Calendar, orgId: string, stats: GcalSyncStats): Promise<string> {
  const [{ data: calList }, adminEmails] = await Promise.all([
    withRetry(() => cal.calendarList.list({ maxResults: 250 })),
    // Coordinateurs inclus : ils posent et suivent les RDV dans l'ERP (RLS admin + coordinator).
    loadAdminEmails(orgId, ["admin", "coordinator"]),
  ]);
  return ensureCalendar(
    cal,
    calList.items ?? [],
    {
      tag: admissionsCalendarTag(orgId),
      summary: ADMISSIONS_CALENDAR_NAME,
      shares: wantedShares(null, adminEmails),
      label: ADMISSIONS_CALENDAR_NAME,
    },
    stats,
  );
}

/** Crée ou met à jour l'événement s'il diffère ; `existing` = undefined → lu sur Google. */
async function upsertEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  body: calendar_v3.Schema$Event,
  existing?: calendar_v3.Schema$Event | null,
): Promise<"upserted" | "unchanged"> {
  let current = existing;
  if (current === undefined) {
    try {
      current = (await withRetry(() => cal.events.get({ calendarId, eventId }))).data;
    } catch (e) {
      if (statusOf(e) !== 404 && statusOf(e) !== 410) throw e;
      current = null;
    }
  }
  if (current && !eventNeedsUpdate(current, body)) return "unchanged";
  if (current) {
    await withRetry(() => cal.events.update({ calendarId, eventId, requestBody: body }));
    return "upserted";
  }
  try {
    await withRetry(() => cal.events.insert({ calendarId, requestBody: { ...body, id: eventId } }));
  } catch (e) {
    // 409 = id déjà pris (événement supprimé puis RDV revenu) : update le restaure.
    if (statusOf(e) !== 409) throw e;
    await withRetry(() => cal.events.update({ calendarId, eventId, requestBody: body }));
  }
  return "upserted";
}

async function deleteEvent(cal: calendar_v3.Calendar, calendarId: string, eventId: string): Promise<void> {
  try {
    await withRetry(() => cal.events.delete({ calendarId, eventId }));
  } catch (e) {
    if (statusOf(e) === 404 || statusOf(e) === 410) return; // déjà supprimé
    throw e;
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "erreur inconnue";
}

// ───────────────────────── Écriture immédiate ─────────────────────────

/**
 * Pousse un rendez-vous vers Google Agenda juste après son enregistrement (création,
 * déplacement, résultat) ou supprime son événement s'il est annulé. Ne lève jamais :
 * l'échec est noté sur le RDV (gcal_error), la passe nocturne réessaiera.
 */
export async function pushAppointmentToGoogle(appointmentId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("admission_appointments").select(ROW_SELECT).eq("id", appointmentId).maybeSingle();
  const row = data as unknown as AppointmentRow | null;
  if (!row) return;

  const { data: org } = await supabase.from("organizations").select("slug").eq("id", row.org_id).maybeSingle();
  if (org?.slug === SANDBOX_SLUG) {
    await recordState(row.id, { eventId: null, error: "Bac à sable : jamais envoyé vers Google Agenda." });
    return;
  }
  if (!gcalConfigured()) {
    await recordState(row.id, { eventId: null, error: "Google Agenda non configuré (compte de service absent)." });
    return;
  }

  try {
    const cal = calendarClient();
    const calendarId = await admissionsCalendarId(cal, row.org_id, emptyStats());
    const eventId = appointmentEventId(row.id);
    if (wantsEvent(row.status)) {
      await upsertEvent(cal, calendarId, eventId, appointmentEventBody(toCalendar(row)));
      await recordState(row.id, { eventId, error: null });
    } else {
      await deleteEvent(cal, calendarId, eventId);
      await recordState(row.id, { eventId: null, error: null });
    }
  } catch (e) {
    await recordState(row.id, { eventId: row.gcal_event_id, error: messageOf(e) });
  }
}

// ───────────────────────── Passe nocturne (filet de sécurité) ─────────────────────────

/**
 * Aligne l'agenda « Admissions PEF — Rendez-vous » d'un organisme sur ses RDV des
 * 7 derniers jours et à venir : crée ou corrige ce qui diffère, supprime les événements
 * des RDV annulés ou effacés. À n'appeler que pour une organisation réelle.
 */
export async function syncAdmissionAppointments(orgId: string): Promise<GcalSyncStats> {
  const stats = emptyStats();
  const supabase = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("admission_appointments")
    .select(ROW_SELECT)
    .eq("org_id", orgId)
    .gte("starts_at", since)
    .order("starts_at");
  if (error) {
    stats.errors.push(`${ADMISSIONS_CALENDAR_NAME} : ${error.message}`);
    return stats;
  }
  const rows = (data ?? []) as unknown as AppointmentRow[];

  const cal = calendarClient();
  let calendarId: string;
  try {
    // Pas de RDV et pas encore d'agenda : on ne crée rien pour rien.
    if (rows.length === 0) {
      const { data: calList } = await withRetry(() => cal.calendarList.list({ maxResults: 250 }));
      if (!(calList.items ?? []).some((c) => c.description?.includes(admissionsCalendarTag(orgId)))) return stats;
    }
    calendarId = await admissionsCalendarId(cal, orgId, stats);
    stats.calendars += 1;
  } catch (e) {
    stats.errors.push(`${ADMISSIONS_CALENDAR_NAME} : ${messageOf(e)}`);
    return stats;
  }

  let existing: calendar_v3.Schema$Event[];
  try {
    existing = await listErpEvents(cal, calendarId, since);
  } catch (e) {
    stats.errors.push(`${ADMISSIONS_CALENDAR_NAME} — lecture des événements : ${messageOf(e)}`);
    return stats;
  }
  const byAppointment = new Map(
    existing
      .filter((e) => e.extendedProperties?.private?.appointmentId)
      .map((e) => [e.extendedProperties!.private!.appointmentId as string, e]),
  );

  for (const row of rows) {
    const eventId = appointmentEventId(row.id);
    const current = byAppointment.get(row.id) ?? null;
    byAppointment.delete(row.id);
    if (!wantsEvent(row.status)) {
      // Annulé : l'événement éventuel part avec les orphelins ci-dessous.
      if (current) byAppointment.set(row.id, current);
      else if (row.gcal_event_id || row.gcal_error) await recordState(row.id, { eventId: null, error: null });
      continue;
    }
    try {
      const result = await upsertEvent(cal, calendarId, eventId, appointmentEventBody(toCalendar(row)), current);
      stats[result] += 1;
      if (result === "upserted" || row.gcal_event_id !== eventId || row.gcal_error) {
        await recordState(row.id, { eventId, error: null });
      }
      if (result === "upserted") await sleep(WRITE_PAUSE_MS);
    } catch (e) {
      stats.errors.push(`${ADMISSIONS_CALENDAR_NAME} — RDV ${row.starts_at} : ${messageOf(e)}`);
      await recordState(row.id, { eventId: row.gcal_event_id, error: messageOf(e) });
    }
  }

  // Événements ERP sans RDV voulu (annulé, supprimé de l'ERP)
  for (const [appointmentId, orphan] of byAppointment) {
    try {
      await deleteEvent(cal, calendarId, orphan.id!);
      stats.deleted += 1;
      if (rows.some((r) => r.id === appointmentId)) await recordState(appointmentId, { eventId: null, error: null });
    } catch (e) {
      stats.errors.push(`${ADMISSIONS_CALENDAR_NAME} — suppression impossible : ${orphan.summary ?? orphan.id} (${messageOf(e)})`);
    }
    await sleep(WRITE_PAUSE_MS);
  }

  return stats;
}

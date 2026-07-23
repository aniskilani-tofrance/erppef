import { google, type calendar_v3 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";

// Synchronisation des séances vers Google Calendar : un agenda par formateur
// (« Cours PEF — Prénom Nom »), créé et possédé par le compte de service, partagé
// en lecture avec l'email du formateur et en écriture avec GCAL_ADMIN_EMAIL.
// Prérequis : API Google Calendar activée sur le projet GCP du compte de service.
//
// Idempotence : l'id d'événement = uuid de la séance sans tirets (alphabet hex ⊂
// base32hex accepté par Calendar), et chaque événement porte un marqueur
// extendedProperties.private { erp: "pef", sessionId } — la sync met à jour ou
// supprime ses propres événements, jamais ceux créés à la main.

const TZ = "Europe/Paris";
const TRAINER_TAG = "erp-trainer:";

export function gcalConfigured(): boolean {
  return Boolean(process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL && process.env.GDRIVE_SERVICE_ACCOUNT_KEY);
}

function calendarClient() {
  const auth = new google.auth.JWT({
    email: process.env.GDRIVE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GDRIVE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

type TrainerRef = { id: string; name: string; email: string | null };

async function ensureTrainerCalendar(
  cal: calendar_v3.Calendar,
  trainer: TrainerRef,
  existingList: calendar_v3.Schema$CalendarListEntry[],
): Promise<string> {
  const tag = `${TRAINER_TAG}${trainer.id}`;
  const found = existingList.find((c) => c.description?.includes(tag));
  if (found?.id) return found.id;

  const { data: created } = await cal.calendars.insert({
    requestBody: {
      summary: `Cours PEF — ${trainer.name}`,
      description: `Agenda généré par l'ERP ParlerEmploi Formation. Ne pas modifier à la main. ${tag}`,
      timeZone: TZ,
    },
  });
  const calendarId = created.id!;

  const shares: { email: string; role: string }[] = [];
  if (trainer.email) shares.push({ email: trainer.email, role: "reader" });
  if (process.env.GCAL_ADMIN_EMAIL) shares.push({ email: process.env.GCAL_ADMIN_EMAIL, role: "writer" });
  for (const share of shares) {
    try {
      await cal.acl.insert({
        calendarId,
        sendNotifications: true,
        requestBody: { role: share.role, scope: { type: "user", value: share.email } },
      });
    } catch {
      // Partage impossible (email invalide…) : l'agenda existe quand même.
    }
  }
  return calendarId;
}

export type GcalSyncStats = {
  calendars: number;
  upserted: number;
  deleted: number;
  errors: string[];
};

export async function syncTrainerCalendars(orgId: string): Promise<GcalSyncStats> {
  const supabase = createAdminClient();
  const cal = calendarClient();
  const stats: GcalSyncStats = { calendars: 0, upserted: 0, deleted: 0, errors: [] };

  const nowIso = new Date().toISOString();
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, starts_at, ends_at, groups(name), rooms:room_id(name), trainers:trainer_id(id, first_name, last_name, email)",
    )
    .eq("org_id", orgId)
    .neq("status", "annulee")
    .not("trainer_id", "is", null)
    .gte("starts_at", nowIso)
    .order("starts_at");
  if (error) throw new Error(error.message);

  // Regroupe par formateur
  const byTrainer = new Map<string, { trainer: TrainerRef; sessions: typeof sessions }>();
  for (const s of sessions ?? []) {
    const t = s.trainers as unknown as { id: string; first_name: string; last_name: string; email: string | null } | null;
    if (!t) continue;
    const entry = byTrainer.get(t.id) ?? {
      trainer: { id: t.id, name: `${t.first_name} ${t.last_name ?? ""}`.trim(), email: t.email },
      sessions: [] as NonNullable<typeof sessions>,
    };
    entry.sessions.push(s);
    byTrainer.set(t.id, entry);
  }

  const { data: calList } = await cal.calendarList.list({ maxResults: 250 });
  const existingCalendars = calList.items ?? [];

  for (const { trainer, sessions: trainerSessions } of byTrainer.values()) {
    try {
      const calendarId = await ensureTrainerCalendar(cal, trainer, existingCalendars);
      stats.calendars += 1;

      // Événements ERP futurs déjà présents sur l'agenda
      const { data: existing } = await cal.events.list({
        calendarId,
        timeMin: nowIso,
        privateExtendedProperty: ["erp=pef"],
        singleEvents: true,
        maxResults: 2500,
      });
      const existingBySession = new Map(
        (existing.items ?? [])
          .filter((e) => e.extendedProperties?.private?.sessionId)
          .map((e) => [e.extendedProperties!.private!.sessionId as string, e]),
      );

      for (const s of trainerSessions ?? []) {
        const group = s.groups as unknown as { name: string } | null;
        const room = s.rooms as unknown as { name: string } | null;
        const body: calendar_v3.Schema$Event = {
          summary: `${group?.name ?? "Cours"}${room ? ` · ${room.name}` : ""}`,
          location: room?.name ?? undefined,
          description: "Séance planifiée par l'ERP ParlerEmploi Formation.",
          start: { dateTime: s.starts_at, timeZone: TZ },
          end: { dateTime: s.ends_at, timeZone: TZ },
          extendedProperties: { private: { erp: "pef", sessionId: s.id } },
        };

        try {
          if (existingBySession.has(s.id)) {
            await cal.events.update({ calendarId, eventId: s.id.replace(/-/g, ""), requestBody: body });
          } else {
            await cal.events.insert({ calendarId, requestBody: { ...body, id: s.id.replace(/-/g, "") } });
          }
          existingBySession.delete(s.id);
          stats.upserted += 1;
        } catch (e) {
          // insert 409 = événement recréé après suppression manuelle : on repasse en update.
          try {
            await cal.events.update({ calendarId, eventId: s.id.replace(/-/g, ""), requestBody: body });
            existingBySession.delete(s.id);
            stats.upserted += 1;
          } catch {
            stats.errors.push(`${trainer.name} — séance ${s.starts_at} : ${e instanceof Error ? e.message : "erreur"}`);
          }
        }
      }

      // Événements ERP futurs sans séance correspondante (déplacée, annulée, supprimée)
      for (const orphan of existingBySession.values()) {
        try {
          await cal.events.delete({ calendarId, eventId: orphan.id! });
          stats.deleted += 1;
        } catch {
          stats.errors.push(`${trainer.name} — suppression impossible : ${orphan.summary ?? orphan.id}`);
        }
      }
    } catch (e) {
      stats.errors.push(`${trainer.name} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  }

  return stats;
}

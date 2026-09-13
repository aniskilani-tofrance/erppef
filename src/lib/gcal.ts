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
//
// Économie d'appels (14/09/2026) : la passe nocturne ne réécrit plus que ce qui a
// changé (comparaison titre / lieu / description / horaires), réessaie avec
// attente exponentielle sur « Rate Limit Exceeded », et à chaque passe vérifie
// que l'agenda porte le nom actuel du formateur et reste partagé avec son email
// actuel (un email ajouté ou corrigé après la création est ainsi pris en compte).

const TZ = "Europe/Paris";
const TRAINER_TAG = "erp-trainer:";
const WRITE_PAUSE_MS = 120; // souffle entre deux écritures (limite Google par minute)

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

// ───────────────────────── Helpers purs (testés) ─────────────────────────

export type TrainerRef = { id: string; name: string; email: string | null };

export type SessionForCalendar = {
  id: string;
  starts_at: string;
  ends_at: string;
  group_name: string | null;
  room_name: string | null;
  room_address: string | null;
  room_access_notes: string | null;
};

export function calendarName(trainer: TrainerRef): string {
  return `Cours PEF — ${trainer.name}`;
}

/** Corps d'événement Google attendu pour une séance (titre, lieu, description, horaires). */
export function eventBody(s: SessionForCalendar): calendar_v3.Schema$Event {
  const location = [s.room_name, s.room_address].filter(Boolean).join(", ");
  const description = [
    "Séance planifiée par l'ERP ParlerEmploi Formation.",
    s.room_access_notes ? `Comment trouver la salle : ${s.room_access_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    summary: `${s.group_name ?? "Cours"}${s.room_name ? ` · ${s.room_name}` : ""}`,
    location: location || undefined,
    description,
    status: "confirmed",
    start: { dateTime: s.starts_at, timeZone: TZ },
    end: { dateTime: s.ends_at, timeZone: TZ },
    extendedProperties: { private: { erp: "pef", sessionId: s.id } },
  };
}

function sameInstant(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return a === b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta === tb : a === b;
}

/** Vrai si l'événement déjà présent sur Google diffère de ce que la séance impose. */
export function eventNeedsUpdate(
  existing: calendar_v3.Schema$Event,
  desired: calendar_v3.Schema$Event,
): boolean {
  if ((existing.summary ?? "") !== (desired.summary ?? "")) return true;
  if ((existing.location ?? "") !== (desired.location ?? "")) return true;
  if ((existing.description ?? "") !== (desired.description ?? "")) return true;
  if ((existing.status ?? "confirmed") !== "confirmed") return true;
  if (!sameInstant(existing.start?.dateTime, desired.start?.dateTime)) return true;
  if (!sameInstant(existing.end?.dateTime, desired.end?.dateTime)) return true;
  return false;
}

export type Share = { email: string; role: "reader" | "writer" };

/** Partages attendus (formateur en lecture, direction en écriture) absents de l'ACL. */
export function missingShares(
  acl: calendar_v3.Schema$AclRule[],
  trainerEmail: string | null | undefined,
  adminEmail: string | null | undefined,
): Share[] {
  const wanted: Share[] = [];
  const t = trainerEmail?.trim().toLowerCase();
  const a = adminEmail?.trim().toLowerCase();
  if (t && t.includes("@")) wanted.push({ email: t, role: "reader" });
  if (a && a.includes("@") && a !== t) wanted.push({ email: a, role: "writer" });

  const rank = { reader: 1, writer: 2, owner: 3 } as Record<string, number>;
  const have = new Map<string, number>();
  for (const rule of acl) {
    const email = rule.scope?.value?.toLowerCase();
    if (!email || rule.scope?.type !== "user") continue;
    have.set(email, Math.max(have.get(email) ?? 0, rank[rule.role ?? ""] ?? 0));
  }
  return wanted.filter((w) => (have.get(w.email) ?? 0) < rank[w.role]);
}

type ErrorLike = { code?: string | number; status?: number; message?: string };

/** Erreurs Google qui valent la peine d'être rejouées (quota, limite par minute, 5xx, réseau). */
export function isRetryable(e: unknown): boolean {
  const err = (e ?? {}) as ErrorLike;
  const status = typeof err.status === "number" ? err.status : Number(err.code);
  const message = err.message ?? "";
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  if (status === 403 && /rate limit|quota|usage limits/i.test(message)) return true;
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message)) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rejoue `fn` avec attente exponentielle (1 s, 2 s, 4 s, 8 s) sur erreur rejouable. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 5,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e) || i === attempts - 1) throw e;
      await sleep(baseDelayMs * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
  throw lastError;
}

function statusOf(e: unknown): number {
  const err = (e ?? {}) as ErrorLike;
  return typeof err.status === "number" ? err.status : Number(err.code);
}

// ───────────────────────── Synchronisation ─────────────────────────

async function ensureTrainerCalendar(
  cal: calendar_v3.Calendar,
  trainer: TrainerRef,
  existingList: calendar_v3.Schema$CalendarListEntry[],
  stats: GcalSyncStats,
): Promise<string> {
  const tag = `${TRAINER_TAG}${trainer.id}`;
  const summary = calendarName(trainer);
  const found = existingList.find((c) => c.description?.includes(tag));

  let calendarId: string;
  if (found?.id) {
    calendarId = found.id;
    // Formateur renommé après la création de l'agenda : on suit.
    if (found.summary !== summary) {
      await withRetry(() => cal.calendars.patch({ calendarId, requestBody: { summary } }));
      stats.renamed += 1;
    }
  } else {
    const { data: created } = await withRetry(() =>
      cal.calendars.insert({
        requestBody: {
          summary,
          description: `Agenda généré par l'ERP ParlerEmploi Formation. Ne pas modifier à la main. ${tag}`,
          timeZone: TZ,
        },
      }),
    );
    calendarId = created.id!;
  }

  // Partages : vérifiés à chaque passe (email ajouté ou corrigé après coup).
  const { data: aclData } = await withRetry(() => cal.acl.list({ calendarId }));
  for (const share of missingShares(aclData.items ?? [], trainer.email, process.env.GCAL_ADMIN_EMAIL)) {
    try {
      await withRetry(() =>
        cal.acl.insert({
          calendarId,
          sendNotifications: true,
          requestBody: { role: share.role, scope: { type: "user", value: share.email } },
        }),
      );
      stats.shared += 1;
    } catch (e) {
      // Partage impossible (adresse sans compte Google…) : l'agenda existe quand même.
      stats.errors.push(`${trainer.name} — partage avec ${share.email} impossible : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return calendarId;
}

async function listErpEvents(cal: calendar_v3.Calendar, calendarId: string, timeMin: string) {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await withRetry(() =>
      cal.events.list({
        calendarId,
        timeMin,
        privateExtendedProperty: ["erp=pef"],
        singleEvents: true,
        maxResults: 2500,
        pageToken,
      }),
    );
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

export type GcalSyncStats = {
  calendars: number;
  upserted: number;
  unchanged: number;
  deleted: number;
  renamed: number;
  shared: number;
  errors: string[];
};

export async function syncTrainerCalendars(orgId: string): Promise<GcalSyncStats> {
  const supabase = createAdminClient();
  const cal = calendarClient();
  const stats: GcalSyncStats = { calendars: 0, upserted: 0, unchanged: 0, deleted: 0, renamed: 0, shared: 0, errors: [] };

  const nowIso = new Date().toISOString();
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, starts_at, ends_at, groups(name), rooms:room_id(name, address, access_notes), trainers:trainer_id(id, first_name, last_name, email)",
    )
    .eq("org_id", orgId)
    .neq("status", "annulee")
    .not("trainer_id", "is", null)
    .gte("starts_at", nowIso)
    .order("starts_at");
  if (error) throw new Error(error.message);

  // Regroupe par formateur
  type Row = NonNullable<typeof sessions>[number];
  const byTrainer = new Map<string, { trainer: TrainerRef; sessions: SessionForCalendar[] }>();
  for (const s of (sessions ?? []) as Row[]) {
    const t = s.trainers as unknown as { id: string; first_name: string; last_name: string | null; email: string | null } | null;
    if (!t) continue;
    const group = s.groups as unknown as { name: string } | null;
    const room = s.rooms as unknown as { name: string; address: string | null; access_notes: string | null } | null;
    const entry = byTrainer.get(t.id) ?? {
      trainer: { id: t.id, name: `${t.first_name} ${t.last_name ?? ""}`.replace(/\s+/g, " ").trim(), email: t.email },
      sessions: [],
    };
    entry.sessions.push({
      id: s.id,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      group_name: group?.name ?? null,
      room_name: room?.name ?? null,
      room_address: room?.address ?? null,
      room_access_notes: room?.access_notes ?? null,
    });
    byTrainer.set(t.id, entry);
  }

  const { data: calList } = await withRetry(() => cal.calendarList.list({ maxResults: 250 }));
  const existingCalendars = calList.items ?? [];

  for (const { trainer, sessions: trainerSessions } of byTrainer.values()) {
    try {
      const calendarId = await ensureTrainerCalendar(cal, trainer, existingCalendars, stats);
      stats.calendars += 1;

      // Événements ERP futurs déjà présents sur l'agenda
      const existing = await listErpEvents(cal, calendarId, nowIso);
      const existingBySession = new Map(
        existing
          .filter((e) => e.extendedProperties?.private?.sessionId)
          .map((e) => [e.extendedProperties!.private!.sessionId as string, e]),
      );

      for (const s of trainerSessions) {
        const body = eventBody(s);
        const eventId = s.id.replace(/-/g, "");
        const current = existingBySession.get(s.id);
        existingBySession.delete(s.id);

        if (current && !eventNeedsUpdate(current, body)) {
          stats.unchanged += 1;
          continue;
        }

        try {
          if (current) {
            await withRetry(() => cal.events.update({ calendarId, eventId, requestBody: body }));
          } else {
            try {
              await withRetry(() => cal.events.insert({ calendarId, requestBody: { ...body, id: eventId } }));
            } catch (e) {
              // 409 = l'id existe déjà (événement supprimé à la main puis séance revenue) : update le restaure.
              if (statusOf(e) !== 409) throw e;
              await withRetry(() => cal.events.update({ calendarId, eventId, requestBody: body }));
            }
          }
          stats.upserted += 1;
        } catch (e) {
          stats.errors.push(`${trainer.name} — séance ${s.starts_at} : ${e instanceof Error ? e.message : "erreur"}`);
        }
        await sleep(WRITE_PAUSE_MS);
      }

      // Événements ERP futurs sans séance correspondante (déplacée, annulée, supprimée)
      for (const orphan of existingBySession.values()) {
        try {
          await withRetry(() => cal.events.delete({ calendarId, eventId: orphan.id! }));
          stats.deleted += 1;
        } catch (e) {
          if (statusOf(e) === 410 || statusOf(e) === 404) continue; // déjà supprimé
          stats.errors.push(`${trainer.name} — suppression impossible : ${orphan.summary ?? orphan.id}`);
        }
        await sleep(WRITE_PAUSE_MS);
      }
    } catch (e) {
      stats.errors.push(`${trainer.name} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  }

  return stats;
}

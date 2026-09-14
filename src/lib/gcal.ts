import { google, type calendar_v3 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";

// Synchronisation des séances vers Google Calendar :
//  - un agenda par formateur (« Cours PEF — Prénom Nom »), partagé en lecture avec l'email
//    de sa fiche et en écriture avec la direction (tous les comptes ERP de rôle admin,
//    plus GCAL_ADMIN_EMAIL) ;
//  - un agenda consolidé (« Cours PEF — Tous les formateurs ») avec toutes les séances de
//    l'organisme, formatrice dans le titre, partagé en écriture avec la direction.
// Les agendas sont créés et possédés par le compte de service.
// Prérequis : API Google Calendar activée sur le projet GCP du compte de service.
//
// Idempotence : l'id d'événement = uuid de la séance sans tirets (alphabet hex ⊂
// base32hex accepté par Calendar), et chaque événement porte un marqueur
// extendedProperties.private { erp: "pef", sessionId } — la sync met à jour ou
// supprime ses propres événements, jamais ceux créés à la main.
//
// Économie d'appels (14/09/2026) : la passe nocturne ne réécrit que ce qui a changé
// (comparaison titre / lieu / description / horaires), réessaie avec attente
// exponentielle sur « Rate Limit Exceeded », et à chaque passe vérifie que l'agenda
// porte le nom actuel et reste partagé avec les bonnes adresses.

const TZ = "Europe/Paris";
const TRAINER_TAG = "erp-trainer:";
const ORG_TAG = "erp-org:";
const ORG_CALENDAR_NAME = "Cours PEF — Tous les formateurs";
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
  trainer_name?: string | null;
};

export function calendarName(trainer: TrainerRef): string {
  return `Cours PEF — ${trainer.name}`;
}

/** Corps d'événement Google attendu pour une séance (titre, lieu, description, horaires). */
export function eventBody(s: SessionForCalendar, options: { withTrainer?: boolean } = {}): calendar_v3.Schema$Event {
  const location = [s.room_name, s.room_address].filter(Boolean).join(", ");
  const description = [
    "Séance planifiée par l'ERP ParlerEmploi Formation.",
    s.room_access_notes ? `Comment trouver la salle : ${s.room_access_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const parts = [s.group_name ?? "Cours"];
  if (s.room_name) parts.push(s.room_name);
  if (options.withTrainer) parts.push(s.trainer_name?.trim() || "formateur à affecter");
  return {
    summary: parts.join(" · "),
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

function cleanEmail(e: string | null | undefined): string | null {
  const v = e?.trim().toLowerCase();
  return v && v.includes("@") ? v : null;
}

/** Partages attendus : formateur en lecture, direction (admins ERP + GCAL_ADMIN_EMAIL) en écriture. */
export function wantedShares(trainerEmail: string | null | undefined, adminEmails: (string | null | undefined)[]): Share[] {
  const shares: Share[] = [];
  const seen = new Set<string>();
  for (const raw of adminEmails) {
    const email = cleanEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    shares.push({ email, role: "writer" });
  }
  const t = cleanEmail(trainerEmail);
  if (t && !seen.has(t)) shares.push({ email: t, role: "reader" });
  return shares;
}

/** Parmi les partages voulus, ceux que l'ACL de l'agenda n'accorde pas encore (au moins ce rôle). */
export function missingShares(acl: calendar_v3.Schema$AclRule[], wanted: Share[]): Share[] {
  const rank = { reader: 1, writer: 2, owner: 3 } as Record<string, number>;
  const have = new Map<string, number>();
  for (const rule of acl) {
    const email = rule.scope?.value?.toLowerCase();
    if (!email || rule.scope?.type !== "user") continue;
    have.set(email, Math.max(have.get(email) ?? 0, rank[rule.role ?? ""] ?? 0));
  }
  return wanted.filter((w) => (have.get(w.email) ?? 0) < rank[w.role]);
}

/** Lien « ajouter / ouvrir cet agenda » dans Google Agenda. */
export function calendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
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

// ───────────────────────── Accès aux données ─────────────────────────

/** Emails de la direction : comptes ERP de rôle admin de l'organisme + GCAL_ADMIN_EMAIL. */
export async function loadAdminEmails(orgId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const emails = new Set<string>();
  const env = cleanEmail(process.env.GCAL_ADMIN_EMAIL);
  if (env) emails.add(env);
  const { data: members } = await supabase.from("memberships").select("user_id").eq("org_id", orgId).eq("role", "admin");
  for (const m of members ?? []) {
    const { data } = await supabase.auth.admin.getUserById(m.user_id);
    const email = cleanEmail(data.user?.email);
    if (email) emails.add(email);
  }
  return [...emails];
}

type Row = {
  id: string;
  trainer_id: string | null;
  co_trainer_id: string | null;
  starts_at: string;
  ends_at: string;
  groups: { name: string } | null;
  rooms: { name: string; address: string | null; access_notes: string | null } | null;
  trainers: { id: string; first_name: string; last_name: string | null; email: string | null } | null;
  co_trainers: { id: string; first_name: string; last_name: string | null; email: string | null } | null;
};

async function loadUpcomingSessions(orgId: string, nowIso: string): Promise<Row[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, co_trainer_id, starts_at, ends_at, groups(name), rooms:room_id(name, address, access_notes), trainers:trainer_id(id, first_name, last_name, email), co_trainers:co_trainer_id(id, first_name, last_name, email)",
    )
    .eq("org_id", orgId)
    .neq("status", "annulee")
    .gte("starts_at", nowIso)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Row[];
}

function trainerName(t: { first_name: string; last_name: string | null }): string {
  return `${t.first_name} ${t.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

function toSession(s: Row): SessionForCalendar {
  return {
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    group_name: s.groups?.name ?? null,
    room_name: s.rooms?.name ?? null,
    room_address: s.rooms?.address ?? null,
    room_access_notes: s.rooms?.access_notes ?? null,
    trainer_name: [s.trainers ? trainerName(s.trainers) : null, s.co_trainers ? trainerName(s.co_trainers) : null].filter(Boolean).join(" + ") || null,
  };
}

// ───────────────────────── Synchronisation ─────────────────────────

export type GcalSyncStats = {
  calendars: number;
  upserted: number;
  unchanged: number;
  deleted: number;
  renamed: number;
  shared: number;
  errors: string[];
};

async function ensureCalendar(
  cal: calendar_v3.Calendar,
  existingList: calendar_v3.Schema$CalendarListEntry[],
  spec: { tag: string; summary: string; shares: Share[]; label: string },
  stats: GcalSyncStats,
): Promise<string> {
  const found = existingList.find((c) => c.description?.includes(spec.tag));

  let calendarId: string;
  if (found?.id) {
    calendarId = found.id;
    // Formateur renommé après la création de l'agenda : on suit.
    if (found.summary !== spec.summary) {
      await withRetry(() => cal.calendars.patch({ calendarId, requestBody: { summary: spec.summary } }));
      stats.renamed += 1;
    }
  } else {
    const { data: created } = await withRetry(() =>
      cal.calendars.insert({
        requestBody: {
          summary: spec.summary,
          description: `Agenda généré par l'ERP ParlerEmploi Formation. Ne pas modifier à la main. ${spec.tag}`,
          timeZone: TZ,
        },
      }),
    );
    calendarId = created.id!;
  }

  // Partages : vérifiés à chaque passe (email ajouté ou corrigé, nouvel admin).
  const { data: aclData } = await withRetry(() => cal.acl.list({ calendarId }));
  for (const share of missingShares(aclData.items ?? [], spec.shares)) {
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
      stats.errors.push(`${spec.label} — partage avec ${share.email} impossible : ${e instanceof Error ? e.message : "erreur"}`);
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

/** Aligne les événements ERP d'un agenda sur la liste des séances voulues (diff, puis orphelins). */
async function syncEvents(
  cal: calendar_v3.Calendar,
  calendarId: string,
  desired: { sessionId: string; body: calendar_v3.Schema$Event }[],
  nowIso: string,
  label: string,
  stats: GcalSyncStats,
) {
  const existing = await listErpEvents(cal, calendarId, nowIso);
  const existingBySession = new Map(
    existing
      .filter((e) => e.extendedProperties?.private?.sessionId)
      .map((e) => [e.extendedProperties!.private!.sessionId as string, e]),
  );

  for (const { sessionId, body } of desired) {
    const eventId = sessionId.replace(/-/g, "");
    const current = existingBySession.get(sessionId);
    existingBySession.delete(sessionId);

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
      stats.errors.push(`${label} — séance ${body.start?.dateTime} : ${e instanceof Error ? e.message : "erreur"}`);
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
      stats.errors.push(`${label} — suppression impossible : ${orphan.summary ?? orphan.id}`);
    }
    await sleep(WRITE_PAUSE_MS);
  }
}

export async function syncTrainerCalendars(orgId: string): Promise<GcalSyncStats> {
  const cal = calendarClient();
  const stats: GcalSyncStats = { calendars: 0, upserted: 0, unchanged: 0, deleted: 0, renamed: 0, shared: 0, errors: [] };

  const nowIso = new Date().toISOString();
  const [rows, adminEmails] = await Promise.all([loadUpcomingSessions(orgId, nowIso), loadAdminEmails(orgId)]);

  // Regroupe par formateur : une séance co-animée va dans l'agenda des deux personnes.
  const byTrainer = new Map<string, { trainer: TrainerRef; sessions: SessionForCalendar[] }>();
  for (const s of rows) {
    for (const t of [s.trainers, s.co_trainers]) {
      if (!t) continue;
      const entry = byTrainer.get(t.id) ?? {
        trainer: { id: t.id, name: trainerName(t), email: t.email },
        sessions: [],
      };
      entry.sessions.push(toSession(s));
      byTrainer.set(t.id, entry);
    }
  }

  const { data: calList } = await withRetry(() => cal.calendarList.list({ maxResults: 250 }));
  const existingCalendars = calList.items ?? [];

  for (const { trainer, sessions } of byTrainer.values()) {
    try {
      const calendarId = await ensureCalendar(
        cal,
        existingCalendars,
        { tag: `${TRAINER_TAG}${trainer.id}`, summary: calendarName(trainer), shares: wantedShares(trainer.email, adminEmails), label: trainer.name },
        stats,
      );
      stats.calendars += 1;
      await syncEvents(
        cal,
        calendarId,
        sessions.map((s) => ({ sessionId: s.id, body: eventBody(s) })),
        nowIso,
        trainer.name,
        stats,
      );
    } catch (e) {
      stats.errors.push(`${trainer.name} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  }

  // Agenda consolidé de la direction : toutes les séances (formatrice dans le titre,
  // y compris celles encore sans formateur). Créé seulement s'il y a quelqu'un à qui le partager.
  if (adminEmails.length > 0) {
    try {
      const calendarId = await ensureCalendar(
        cal,
        existingCalendars,
        { tag: `${ORG_TAG}${orgId}`, summary: ORG_CALENDAR_NAME, shares: wantedShares(null, adminEmails), label: ORG_CALENDAR_NAME },
        stats,
      );
      stats.calendars += 1;
      await syncEvents(
        cal,
        calendarId,
        rows.map((s) => ({ sessionId: s.id, body: eventBody(toSession(s), { withTrainer: true }) })),
        nowIso,
        ORG_CALENDAR_NAME,
        stats,
      );
    } catch (e) {
      stats.errors.push(`${ORG_CALENDAR_NAME} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  }

  return stats;
}

// ───────────────────────── Inventaire (page Paramètres) ─────────────────────────

export type OrgCalendar = {
  kind: "all" | "trainer";
  title: string;
  calendarId: string;
  url: string;
  shares: { email: string; role: string }[];
};

/** Les agendas Google de l'organisme (consolidé + un par formateur) avec leurs partages. */
export async function listOrgCalendars(orgId: string): Promise<OrgCalendar[]> {
  const cal = calendarClient();
  const supabase = createAdminClient();
  const { data: trainers } = await supabase.from("trainers").select("id, first_name, last_name").eq("org_id", orgId);
  const trainerById = new Map((trainers ?? []).map((t) => [t.id, trainerName(t)]));

  const { data: calList } = await withRetry(() => cal.calendarList.list({ maxResults: 250 }));
  const result: OrgCalendar[] = [];
  for (const c of calList.items ?? []) {
    const description = c.description ?? "";
    let kind: OrgCalendar["kind"] | null = null;
    if (description.includes(`${ORG_TAG}${orgId}`)) kind = "all";
    else {
      const match = description.match(/erp-trainer:([0-9a-f-]{36})/);
      if (match && trainerById.has(match[1])) kind = "trainer";
    }
    if (!kind || !c.id) continue;
    const { data: acl } = await withRetry(() => cal.acl.list({ calendarId: c.id! }));
    result.push({
      kind,
      title: c.summary ?? c.id,
      calendarId: c.id,
      url: calendarUrl(c.id),
      shares: (acl.items ?? [])
        .filter((r) => r.scope?.type === "user" && r.scope.value && !r.scope.value.endsWith(".gserviceaccount.com"))
        .map((r) => ({ email: r.scope!.value!, role: r.role ?? "" })),
    });
  }
  return result.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, "fr") : a.kind === "all" ? -1 : 1));
}

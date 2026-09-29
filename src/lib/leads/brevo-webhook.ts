// Retours Brevo (webhook transactionnel) : lecture pure du payload et règles de décision.
//
// Brevo appelle l'ERP à chaque événement sur un e-mail transactionnel : délivré, bounce
// doux ou dur, bloqué, adresse invalide, désinscription, plainte (spam), ouverture, clic…
// L'ERP en garde quatre familles sur la fiche (délivré, bounce, désinscription, plainte),
// journalise tout dans employer_lead_email_events, et arrête les séquences quand
// l'adresse ne doit plus recevoir de message.
//
// Retrouver la fiche : Brevo renvoie tel quel l'en-tête X-Mailin-custom posé à l'envoi
// (« lead_ref:L-0042|event:poei_lead_nouveau »), puis l'identifiant du message, puis
// l'adresse e-mail. Les trois pistes sont rendues ici, le point d'entrée les essaie dans
// cet ordre.

import type { SequenceStopReason } from "@/lib/leads/sequences";

export type BrevoWebhookEvent = {
  event: string;
  email: string | null;
  messageId: string | null;
  leadNo: number | null;
  leadEvent: string | null; // l'événement ERP de l'e-mail concerné (poei_lead_…)
  reason: string | null;
  occurredAt: string; // ISO
  tags: string[];
  raw: Record<string, unknown>;
};

export type EmailStatus = "delivered" | "soft_bounce" | "hard_bounce" | "unsubscribed" | "complaint";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseCustom(custom: string | null): { leadNo: number | null; leadEvent: string | null } {
  if (!custom) return { leadNo: null, leadEvent: null };
  const ref = /lead_ref:L-(\d+)/i.exec(custom);
  const ev = /event:([a-z0-9_]+)/i.exec(custom);
  return { leadNo: ref ? Number(ref[1]) : null, leadEvent: ev ? ev[1] : null };
}

function parseTags(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.tags)) return raw.tags.filter((t): t is string => typeof t === "string");
  const tag = str(raw.tag);
  if (!tag) return [];
  try {
    const parsed = JSON.parse(tag) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    // « tag » est une simple chaîne
  }
  return [tag];
}

function parseWhen(raw: Record<string, unknown>, now: Date): string {
  for (const key of ["ts_event", "ts", "ts_epoch"]) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      const ms = v > 1e12 ? v : v * 1000;
      return new Date(ms).toISOString();
    }
  }
  const date = str(raw.date);
  if (date) {
    // « 2026-09-29 11:00:00 » sans fuseau : lu en UTC, faute de mieux (ts_event prime quand il existe).
    const iso = date.replace(" ", "T");
    const parsed = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return now.toISOString();
}

function parseOne(raw: unknown, now: Date): BrevoWebhookEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const event = str(r.event)?.toLowerCase();
  if (!event) return null;
  const custom = str(r["X-Mailin-custom"]) ?? str(r["x-mailin-custom"]) ?? str(r.custom);
  const { leadNo, leadEvent } = parseCustom(custom);
  const tags = parseTags(r);
  return {
    event,
    email: str(r.email)?.toLowerCase() ?? null,
    messageId: str(r["message-id"]) ?? str(r.message_id) ?? str(r.messageId),
    leadNo,
    leadEvent: leadEvent ?? tags.find((t) => t.startsWith("poei_lead_")) ?? null,
    reason: str(r.reason) ?? null,
    occurredAt: parseWhen(r, now),
    tags,
    raw: r,
  };
}

/** Un payload Brevo = un événement, parfois un tableau. Tout ce qui n'est pas lisible est ignoré. */
export function parseBrevoWebhook(payload: unknown, now: Date = new Date()): BrevoWebhookEvent[] {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.map((item) => parseOne(item, now)).filter((e): e is BrevoWebhookEvent => e !== null);
}

/** La famille retenue sur la fiche pour un événement Brevo ; null = sans effet (ouverture, clic, différé…). */
export function emailStatusForBrevoEvent(event: string): EmailStatus | null {
  switch (event) {
    case "delivered":
      return "delivered";
    case "soft_bounce":
      return "soft_bounce";
    case "hard_bounce":
    case "blocked":
    case "invalid_email":
      return "hard_bounce";
    case "unsubscribed":
      return "unsubscribed";
    case "spam":
    case "complaint":
      return "complaint";
    default:
      return null;
  }
}

const SEVERITY: Record<EmailStatus, number> = { delivered: 0, soft_bounce: 1, hard_bounce: 2, unsubscribed: 3, complaint: 3 };

/**
 * Un « délivré » qui arrive après une désinscription ne la lève pas ; un bounce dur ne
 * se répare pas tout seul. Le statut de la fiche ne redescend donc jamais en gravité,
 * sauf si un conseiller le remet à zéro à la main.
 */
export function mergeEmailStatus(previous: string | null | undefined, next: EmailStatus): EmailStatus {
  const prev = previous as EmailStatus | null | undefined;
  if (!prev || !(prev in SEVERITY)) return next;
  return SEVERITY[next] >= SEVERITY[prev] ? next : prev;
}

export function stopReasonForEmailStatus(status: EmailStatus): SequenceStopReason | null {
  switch (status) {
    case "hard_bounce":
      return "bounce_dur";
    case "unsubscribed":
      return "desinscription";
    case "complaint":
      return "opposition";
    default:
      return null;
  }
}

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  delivered: "E-mail délivré",
  soft_bounce: "Bounce doux (boîte pleine ou serveur indisponible)",
  hard_bounce: "Adresse invalide (bounce dur)",
  unsubscribed: "Désinscrit (lien Brevo)",
  complaint: "Plainte (signalé comme indésirable)",
};

export function emailStatusLabel(status: string | null | undefined): string | null {
  return status && status in EMAIL_STATUS_LABELS ? EMAIL_STATUS_LABELS[status as EmailStatus] : null;
}

/** La ligne de journal, lisible par un conseiller, pour un retour Brevo qui compte. */
export function journalLineForBrevoEvent(ev: BrevoWebhookEvent, status: EmailStatus, emailTitle: string | null): string {
  const sujet = emailTitle ? `« ${emailTitle} »` : "l'e-mail automatique";
  const motif = ev.reason ? ` Motif Brevo : ${ev.reason}.` : "";
  switch (status) {
    case "delivered":
      return `[brevo-retour:delivered] ${sujet} : délivré dans la boîte du restaurateur.`;
    case "soft_bounce":
      return `[brevo-retour:soft_bounce] ${sujet} : bounce doux, Brevo réessaie (boîte pleine ou serveur indisponible).${motif}`;
    case "hard_bounce":
      return `[brevo-retour:hard_bounce] ${sujet} : adresse invalide (bounce dur). Plus aucun e-mail automatique ; vérifier l'adresse avec le restaurateur.${motif}`;
    case "unsubscribed":
      return `[brevo-retour:unsubscribed] Le restaurateur s'est désinscrit via le lien Brevo (${sujet}). Opposition enregistrée : plus aucun message automatique.`;
    case "complaint":
      return `[brevo-retour:complaint] Le restaurateur a signalé ${sujet} comme indésirable. Opposition enregistrée : plus aucun message automatique.`;
  }
}

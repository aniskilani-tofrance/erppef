// Groupe WhatsApp de la classe. PUR : la page charge, ce module décide.
//   - lien d'invitation : seul un lien chat.whatsapp.com est accepté ;
//   - qui ajouter / retirer : d'après l'inscription ET le consentement de chaque personne ;
//   - texte pour le groupe : le français puis chaque traduction, à coller dans le groupe d'annonces ;
//   - invitation de tout le groupe : à qui envoyer le lien, un par un.

import { toWhatsAppNumber } from "@/lib/admission/phone";

const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{8,}$/;

export function normalizeWhatsAppGroupLink(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const url = withScheme.replace(/^http:\/\//i, "https://").replace(/^https:\/\/(www\.)?/i, "https://").replace(/\/+$/, "").split(/[?#]/)[0];
  return INVITE_RE.test(url) ? url : null;
}

export function isWhatsAppGroupLink(url: string | null | undefined): boolean {
  return Boolean(url && INVITE_RE.test(url));
}

export type RosterMember = {
  learnerId: string;
  name: string;
  phone: string | null;
  status: "inscrit" | "abandon" | "termine";
  consent: boolean | null; // null = pas encore demandé
};

export type WhatsAppRoster = {
  toAdd: RosterMember[]; // inscrits qui ont accepté → à ajouter au groupe
  toRemove: RosterMember[]; // partis (abandon, terminé) qui avaient accepté → à retirer du groupe
  refused: RosterMember[]; // inscrits qui ont refusé → jamais ajoutés
  notAsked: RosterMember[]; // inscrits à qui on n'a pas encore demandé
};

export function whatsappGroupRoster(members: RosterMember[]): WhatsAppRoster {
  const byName = (a: RosterMember, b: RosterMember) => a.name.localeCompare(b.name, "fr");
  return {
    toAdd: members.filter((m) => m.status === "inscrit" && m.consent === true).sort(byName),
    toRemove: members.filter((m) => m.status !== "inscrit" && m.consent === true).sort(byName),
    refused: members.filter((m) => m.status === "inscrit" && m.consent === false).sort(byName),
    notAsked: members.filter((m) => m.status === "inscrit" && m.consent === null).sort(byName),
  };
}

// ── « Inviter tout le groupe » : le lien du groupe à chaque inscrit, un par un ─────
// Destinataires : les inscrits, sauf ceux qui ont refusé le groupe. Une invitation déjà envoyée
// pour CE groupe (note au journal) est signalée et décochée. Ordre alphabétique.

export const GROUP_INVITE_NOTE_PREFIX = "Invitation au groupe WhatsApp de la classe envoyée";

export function groupInviteNote(groupName: string, channel: "whatsapp" | "sms"): string {
  return `${GROUP_INVITE_NOTE_PREFIX} (${channel === "sms" ? "SMS" : "WhatsApp"}) — ${groupName}`;
}

/** SMS court, sans emoji (un SMS avec emoji se découpe en nombreux morceaux). */
export function buildGroupInviteSms(groupName: string, url: string): string {
  return `ParlerEmploi : le groupe WhatsApp de votre classe de français (${groupName}). Pour entrer dans le groupe, touchez ce lien : ${url}`;
}

export type InviteMember = RosterMember & { firstName: string | null };
export type InviteContact = { learner_id: string; contacted_at: string; note: string | null };
export type InviteTarget = {
  learnerId: string;
  name: string;
  firstName: string | null;
  phone: string | null;
  phoneOk: boolean;
  consent: boolean | null;
  alreadySentAt: string | null;
};

export function pickGroupInviteQueue(
  members: readonly InviteMember[],
  contacts: readonly InviteContact[],
  groupName: string,
): { targets: InviteTarget[]; refused: number } {
  const lastSent = new Map<string, string>();
  for (const c of contacts) {
    const note = c.note ?? "";
    if (!note.startsWith(GROUP_INVITE_NOTE_PREFIX) || !note.endsWith(`— ${groupName}`)) continue;
    const prev = lastSent.get(c.learner_id);
    if (!prev || c.contacted_at > prev) lastSent.set(c.learner_id, c.contacted_at);
  }
  const enrolled = members.filter((m) => m.status === "inscrit");
  const targets = enrolled
    .filter((m) => m.consent !== false)
    .map((m) => ({
      learnerId: m.learnerId,
      name: m.name,
      firstName: m.firstName,
      phone: m.phone,
      phoneOk: Boolean(toWhatsAppNumber(m.phone)),
      consent: m.consent,
      alreadySentAt: lastSent.get(m.learnerId) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { targets, refused: enrolled.length - targets.length };
}

// Message collectif : français d'abord, puis chaque traduction (une seule fois par langue).
export function groupBroadcastText(fr: string, translations: { language: string; text: string }[]): string {
  const seen = new Set<string>();
  const parts = [fr.trim()];
  for (const t of translations) {
    const key = t.language.trim().toLowerCase();
    const text = t.text.trim();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join("\n\n");
}

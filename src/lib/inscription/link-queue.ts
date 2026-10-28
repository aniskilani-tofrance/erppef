// « Envoyer le lien à la suite » (carte « Inscription par lien » d'une réunion) : à qui envoyer le
// message du lien, un toucher par personne sur WhatsApp. Fonction pure (client et serveur), testée
// sans base.
//
//   • destinataires : les convoqués des créneaux du lien (à envoyer, envoyée), une ligne par personne
//     même si elle est convoquée à plusieurs créneaux ;
//   • exclus : déjà inscrit(e) (confirmé(e) ou présent(e) à un créneau du lien), excusé(e), absent(e) ;
//   • déjà reçu le lien depuis moins de LINK_RECENT_DAYS jours (note au journal) : signalé et décoché ;
//   • ordre de convocation (la plus ancienne d'abord).

import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { toWhatsAppNumber } from "@/lib/admission/phone";

// Note du journal à chaque envoi ; le préfixe repère un lien déjà reçu, quel que soit le canal.
export const LINK_QUEUE_NOTE_PREFIX = "Lien d'inscription à la réunion envoyé";
export const LINK_QUEUE_NOTE = `${LINK_QUEUE_NOTE_PREFIX} (WhatsApp)`;
export const LINK_QUEUE_SMS_NOTE = `${LINK_QUEUE_NOTE_PREFIX} (SMS)`;
export const LINK_RECENT_DAYS = 14;

// ── SMS (gratuit, depuis le téléphone de l'association) ──────────────────────
// Le lien « sms: » ouvre l'application Messages avec le numéro et le texte : rien ne part sans
// appuyer sur Envoyer, et c'est le forfait du téléphone qui paie. Ne fonctionne que sur un
// téléphone (ou un Mac relié à l'iPhone) ; « ?& » est la forme comprise par iOS et Android.
export function smsUrl(phone: string | null | undefined, body: string): string | null {
  const n = toWhatsAppNumber(phone);
  return n ? `sms:+${n}?&body=${encodeURIComponent(body)}` : null;
}

/** « le 28/10 à 17h00 ou le 29/10 à 10h00 » (heure de Paris), dans l'ordre chronologique. */
export function shortDatesText(startsAts: readonly string[]): string {
  const parts = [...startsAts]
    .sort()
    .map((iso) => {
      const [, m, d] = utcToLocalDate(iso).split("-");
      return `le ${d}/${m} à ${utcToLocalTime(iso).replace(":", "h")}`;
    });
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ou ${parts[parts.length - 1]}`;
}

/**
 * SMS court, sans emoji ni lieu (un SMS long ou avec emojis se découpe en nombreux morceaux ; la
 * page du lien donne le lieu et l'heure de passage) :
 * « ParlerEmploi : réunion d'information sur les cours de français le 28/10 à 17h00 ou le 29/10
 * à 10h00, au choix. Test oral sur place. Places limitées. Inscription (2 min) : <lien> »
 */
export function buildMeetingSms({ startsAts, link, oralTest }: { startsAts: readonly string[]; link: string; oralTest: boolean }): string {
  const choice = startsAts.length > 1 ? ", au choix" : "";
  return [
    `ParlerEmploi : réunion d'information sur les cours de français ${shortDatesText(startsAts)}${choice}.`,
    oralTest ? "Test oral sur place." : null,
    `Places limitées. Inscription (2 min) : ${link}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export type LinkQueueInvitation = {
  learner_id: string;
  status: string;
  created_at: string;
  learners: { first_name: string | null; last_name: string | null; phone: string | null } | null;
};
export type LinkQueueContact = { learner_id: string; contacted_at: string; note: string | null };

export type LinkTarget = {
  learnerId: string;
  name: string;
  phone: string | null;
  phoneOk: boolean;
  alreadySentAt: string | null;
};

const WAITING = ["a_envoyer", "envoyee"];
const SEATED = ["confirmee", "presente"];

export function pickLinkQueue(
  invitations: readonly LinkQueueInvitation[],
  contacts: readonly LinkQueueContact[],
  now: Date = new Date(),
): { targets: LinkTarget[]; skippedRegistered: number } {
  const seated = new Set(invitations.filter((i) => SEATED.includes(i.status)).map((i) => i.learner_id));
  const since = now.getTime() - LINK_RECENT_DAYS * 86_400_000;
  const lastSent = new Map<string, string>();
  for (const c of contacts) {
    if (!c.note?.startsWith(LINK_QUEUE_NOTE_PREFIX) || Date.parse(c.contacted_at) < since) continue;
    const prev = lastSent.get(c.learner_id);
    if (!prev || Date.parse(c.contacted_at) > Date.parse(prev)) lastSent.set(c.learner_id, c.contacted_at);
  }

  const byLearner = new Map<string, LinkQueueInvitation>();
  for (const i of [...invitations].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!WAITING.includes(i.status) || seated.has(i.learner_id) || byLearner.has(i.learner_id)) continue;
    byLearner.set(i.learner_id, i);
  }

  const targets = [...byLearner.values()].map((i) => {
    const l = i.learners;
    const name = [l?.first_name, l?.last_name].filter(Boolean).join(" ").trim() || "Sans nom";
    return {
      learnerId: i.learner_id,
      name,
      phone: l?.phone ?? null,
      phoneOk: Boolean(toWhatsAppNumber(l?.phone)),
      alreadySentAt: lastSent.get(i.learner_id) ?? null,
    };
  });
  return { targets, skippedRegistered: seated.size };
}

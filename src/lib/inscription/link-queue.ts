// « Envoyer le lien à la suite » (carte « Inscription par lien » d'une réunion) : à qui envoyer le
// message du lien, un toucher par personne sur WhatsApp. Fonction pure (client et serveur), testée
// sans base.
//
//   • destinataires : les convoqués des créneaux du lien (à envoyer, envoyée), une ligne par personne
//     même si elle est convoquée à plusieurs créneaux ;
//   • exclus : déjà inscrit(e) (confirmé(e) ou présent(e) à un créneau du lien), excusé(e), absent(e) ;
//   • déjà reçu le lien depuis moins de LINK_RECENT_DAYS jours (note au journal) : signalé et décoché ;
//   • ordre de convocation (la plus ancienne d'abord).

import { toWhatsAppNumber } from "@/lib/admission/phone";

export const LINK_QUEUE_NOTE = "Lien d'inscription à la réunion envoyé (WhatsApp)";
export const LINK_RECENT_DAYS = 14;

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
    if (!c.note?.startsWith(LINK_QUEUE_NOTE) || Date.parse(c.contacted_at) < since) continue;
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

// Envoi groupé de l'invitation au test de positionnement (onglet Admission) : qui la reçoit.
// Fonction pure (client et serveur), testée sans base.
//
//   • statuts visés : « À contacter » (nouveau) et « Contacté » ;
//   • exclus : test déjà fait, ou niveau déjà connu ;
//   • lien : le dernier test « en attente » de la personne, sinon un test à créer ;
//   • déjà invité(e) récemment (note « Invitation au test… » au journal depuis moins de
//     RECENT_DAYS jours) : signalé, et décoché par défaut dans la file d'envoi ;
//   • ordre d'arrivée (la plus ancienne demande d'abord).

import { toWhatsAppNumber } from "@/lib/admission/phone";

export const BULK_TEST_STATUSES = ["nouveau", "contacte"] as const;
export const BULK_TEST_NOTE = "Invitation au test de positionnement (WhatsApp)";
export const RECENT_DAYS = 14;

export type BulkLearnerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  admission_status: string | null;
  level_assessed: string | null;
  created_at: string;
};
export type BulkTestRow = { learner_id: string; status: string; token: string; created_at: string };
export type BulkContactRow = { learner_id: string; contacted_at: string; note: string | null };

export type BulkTarget = {
  learnerId: string;
  firstName: string | null;
  name: string;
  phone: string | null;
  phoneOk: boolean;
  status: string;
  token: string | null; // null : test à créer
  alreadySentAt: string | null;
};

export type BulkSelection = { targets: BulkTarget[]; skippedDone: number };

const isInvitationNote = (note: string | null) => /^invitation au test/i.test(note?.trim() ?? "");

export function pickBulkTestTargets(
  learners: readonly BulkLearnerRow[],
  tests: readonly BulkTestRow[],
  contacts: readonly BulkContactRow[],
  now: Date = new Date(),
): BulkSelection {
  const done = new Set(tests.filter((t) => t.status === "fait").map((t) => t.learner_id));
  const pending = new Map<string, BulkTestRow>();
  for (const t of tests) {
    if (t.status !== "en_attente") continue;
    const prev = pending.get(t.learner_id);
    if (!prev || Date.parse(t.created_at) > Date.parse(prev.created_at)) pending.set(t.learner_id, t);
  }
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const lastInvite = new Map<string, string>();
  for (const c of contacts) {
    if (!isInvitationNote(c.note) || Date.parse(c.contacted_at) < since) continue;
    const prev = lastInvite.get(c.learner_id);
    if (!prev || Date.parse(c.contacted_at) > Date.parse(prev)) lastInvite.set(c.learner_id, c.contacted_at);
  }

  let skippedDone = 0;
  const targets: BulkTarget[] = [];
  const statuses = BULK_TEST_STATUSES as readonly string[];
  for (const l of [...learners].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (!statuses.includes(l.admission_status ?? "")) continue;
    if (done.has(l.id) || l.level_assessed) {
      skippedDone++;
      continue;
    }
    const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "Sans nom";
    targets.push({
      learnerId: l.id,
      firstName: l.first_name?.trim() || null,
      name,
      phone: l.phone,
      phoneOk: Boolean(toWhatsAppNumber(l.phone)),
      status: l.admission_status!,
      token: pending.get(l.id)?.token ?? null,
      alreadySentAt: lastInvite.get(l.id) ?? null,
    });
  }
  return { targets, skippedDone };
}

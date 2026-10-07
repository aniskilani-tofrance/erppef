// Absents à relancer : qui a manqué sa dernière séance émargée et n'a pas encore été
// contacté depuis. PUR (aucun accès base) : la page charge les données, ce module décide.
//
// Règle : on regarde, pour chaque apprenant, sa DERNIÈRE séance émargée (feuille
// clôturée) des 14 derniers jours. S'il y était absent et qu'aucun contact n'a été noté
// dans son carnet depuis le début de cette séance, il apparaît dans la liste. Revenu
// en cours (présent ou en retard) ou déjà contacté → il disparaît tout seul.

export const FOLLOWUP_WINDOW_DAYS = 14;

export type FollowupAttendance = {
  learnerId: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  startsAt: string; // ISO UTC
  status: "present" | "retard" | "absent";
};

export type FollowupLearner = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
};

export type FollowupContact = { learnerId: string; contactedAt: string };

export type FollowupNextSession = { groupId: string; startsAt: string; roomName: string | null };

export type AbsenceFollowup = {
  learnerId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  groupName: string;
  missedAt: string; // début de la séance manquée (ISO UTC)
  streak: number; // absences consécutives sur ce groupe, la dernière comprise
  nextSession: { startsAt: string; roomName: string | null } | null;
};

export function computeAbsenceFollowups(input: {
  attendances: FollowupAttendance[];
  learners: FollowupLearner[];
  contacts: FollowupContact[];
  nextSessions: FollowupNextSession[]; // séances à venir (tous groupes), triées ou non
  now: Date;
}): AbsenceFollowup[] {
  const since = input.now.getTime() - FOLLOWUP_WINDOW_DAYS * 86_400_000;
  const learnerById = new Map(input.learners.map((l) => [l.id, l]));

  // Dernier contact connu par apprenant
  const lastContact = new Map<string, number>();
  for (const c of input.contacts) {
    const t = new Date(c.contactedAt).getTime();
    if (t > (lastContact.get(c.learnerId) ?? 0)) lastContact.set(c.learnerId, t);
  }

  // Émargements par apprenant, du plus récent au plus ancien
  const byLearner = new Map<string, FollowupAttendance[]>();
  for (const a of input.attendances) {
    const list = byLearner.get(a.learnerId) ?? [];
    list.push(a);
    byLearner.set(a.learnerId, list);
  }

  const result: AbsenceFollowup[] = [];
  for (const [learnerId, rows] of byLearner) {
    rows.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const last = rows[0];
    if (last.status !== "absent") continue;
    const missed = new Date(last.startsAt).getTime();
    if (missed < since) continue;
    if ((lastContact.get(learnerId) ?? 0) >= missed) continue;
    const learner = learnerById.get(learnerId);
    if (!learner) continue;

    let streak = 0;
    for (const r of rows.filter((x) => x.groupId === last.groupId)) {
      if (r.status !== "absent") break;
      streak += 1;
    }

    const nowIso = input.now.toISOString();
    const next = input.nextSessions
      .filter((s) => s.groupId === last.groupId && s.startsAt > nowIso)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

    result.push({
      learnerId,
      firstName: learner.firstName,
      lastName: learner.lastName,
      phone: learner.phone,
      groupName: last.groupName,
      missedAt: last.startsAt,
      streak,
      nextSession: next ? { startsAt: next.startsAt, roomName: next.roomName } : null,
    });
  }

  // Les séries d'absences d'abord (risque de décrochage), puis la plus récente
  return result.sort((a, b) => b.streak - a.streak || b.missedAt.localeCompare(a.missedAt));
}

// « mardi 6 octobre »
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });
}

function timeLabel(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    .replace(":", "h");
}

// Message WhatsApp pré-rempli, en français simple (public FLE), relu avant envoi.
export function buildAbsenceFollowupMessage(f: {
  firstName: string;
  senderFirstName: string | null;
  missedAt: string;
  streak: number;
  nextSession: { startsAt: string; roomName: string | null } | null;
}): string {
  const who = f.senderFirstName ? `C'est ${f.senderFirstName}, de ParlerEmploi Formation.` : "C'est ParlerEmploi Formation.";
  const missed =
    f.streak > 1
      ? `Nous ne vous avons pas vu(e) aux ${f.streak} derniers cours de français.`
      : `Nous ne vous avons pas vu(e) au cours de français du ${dayLabel(f.missedAt)}.`;
  const next = f.nextSession
    ? `Le prochain cours : ${dayLabel(f.nextSession.startsAt)} à ${timeLabel(f.nextSession.startsAt)}${f.nextSession.roomName ? `, ${f.nextSession.roomName}` : ""}.`
    : null;
  return [
    `Bonjour ${f.firstName},`,
    who,
    `${missed} Tout va bien ?`,
    ...(next ? [next] : []),
    "Si vous avez un problème, répondez à ce message : on cherche une solution ensemble.",
    "À bientôt !",
  ].join("\n");
}

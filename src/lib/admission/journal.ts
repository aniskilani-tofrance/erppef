import { channelLabel, isInternalNote, outcomeLabel, reasonLabel } from "@/lib/admission/status";

// Fil « Notes et échanges » de la fiche apprenant : le journal d'admission (contacts et
// notes internes) + les repères datés de la fiche (entretien d'entrée, entretien oral),
// du plus récent au plus ancien. Pur : testable sans base.

export type JournalContactRow = {
  id: string;
  contacted_at: string; // ISO
  channel: string;
  outcome: string;
  note: string | null;
  reason?: string | null;
  by_name?: string | null;
};

export type JournalMilestones = {
  entryInterviewOn: string | null; // YYYY-MM-DD
  entryNeed: string | null;
  oralTestOn: string | null; // YYYY-MM-DD
  oralTestLevel: string | null;
  oralTestEvaluator: string | null;
  oralTestComment: string | null;
};

export type JournalEntry = {
  id: string;
  at: string; // ISO, sert au tri
  dayOnly: boolean; // repère sans heure (date de fiche)
  kind: "note" | "contact" | "repere";
  title: string;
  text: string | null;
  by: string | null;
};

// Une date de fiche (sans heure) est placée à midi, heure de Paris approximée en UTC :
// elle se range avec les contacts du même jour sans changer de jour.
function dayToIso(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export function buildJournal(contacts: JournalContactRow[], m: JournalMilestones): JournalEntry[] {
  const entries: JournalEntry[] = contacts.map((c) => {
    const note = isInternalNote(c.channel);
    const reason = reasonLabel(c.reason);
    return {
      id: c.id,
      at: c.contacted_at,
      dayOnly: false,
      kind: note ? "note" : "contact",
      title: note ? "Note interne" : `${channelLabel(c.channel)} · ${outcomeLabel(c.outcome)}${reason ? ` · ${reason}` : ""}`,
      text: c.note?.trim() || null,
      by: c.by_name ?? null,
    };
  });
  if (m.entryInterviewOn) {
    entries.push({
      id: "repere-entretien-entree",
      at: dayToIso(m.entryInterviewOn),
      dayOnly: true,
      kind: "repere",
      title: "Entretien d'entrée",
      text: m.entryNeed?.trim() || null,
      by: null,
    });
  }
  if (m.oralTestOn) {
    entries.push({
      id: "repere-entretien-oral",
      at: dayToIso(m.oralTestOn),
      dayOnly: true,
      kind: "repere",
      title: `Entretien oral${m.oralTestLevel ? ` · ${m.oralTestLevel}` : ""}`,
      text: m.oralTestComment?.trim() || null,
      by: m.oralTestEvaluator?.trim() || null,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

// Dernier VRAI contact parmi des lignes de journal triées du plus récent au plus ancien
// (les notes internes ne comptent pas).
export function lastContactAt(rows: { contacted_at: string; channel: string }[]): string | null {
  return rows.find((r) => !isInternalNote(r.channel))?.contacted_at ?? null;
}

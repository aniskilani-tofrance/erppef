// Sorties de formation (abandon) : motif obligatoire, et la trace qui va avec pour Qualiopi
// (engagement des bénéficiaires, prévention des ruptures de parcours) : dernière présence,
// absences avant la sortie, relances notées au carnet. Fonctions pures, testées sans base.
//
// leave_reason (colonne existante) : le code du motif, ou « autre : précision ». Les anciennes
// sorties sans motif restent lisibles (« motif non renseigné »).

import { isAttended } from "@/lib/attendance-status";

export const LEAVE_REASONS = [
  { code: "emploi", label: "A trouvé un emploi" },
  { code: "autre_formation", label: "Est entré(e) dans une autre formation" },
  { code: "demenagement", label: "A déménagé" },
  { code: "sante", label: "Raison de santé" },
  { code: "garde_enfant", label: "Garde d'enfant" },
  { code: "horaires", label: "Horaires incompatibles" },
  { code: "niveau", label: "Niveau trop facile ou trop difficile" },
  { code: "injoignable", label: "Injoignable après relances" },
  { code: "autre", label: "Autre (préciser)" },
] as const;
export type LeaveReasonCode = (typeof LEAVE_REASONS)[number]["code"];
export const LEAVE_REASON_CODES = LEAVE_REASONS.map((r) => r.code) as [LeaveReasonCode, ...LeaveReasonCode[]];

// Seuils de la suggestion « passer en abandon » : une série d'absences ET des relances restées
// sans retour depuis la première de ces absences.
export const DROPOUT_ABSENCES = 3;
export const DROPOUT_RELANCES = 2;

/** Valeur enregistrée : le code, ou « autre : précision » (précision obligatoire pour « autre »). */
export function formatLeaveReason(code: LeaveReasonCode, detail: string | null | undefined): string | null {
  const d = (detail ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (code === "autre") return d ? `autre : ${d}` : null;
  return d ? `${code} : ${d}` : code;
}

/** Libellé lisible d'une valeur enregistrée (code seul, code + précision, ou ancien texte libre). */
export function describeLeaveReason(stored: string | null | undefined): string {
  const s = (stored ?? "").trim();
  if (!s) return "motif non renseigné";
  const [code, ...rest] = s.split(" : ");
  const reason = LEAVE_REASONS.find((r) => r.code === code);
  if (!reason) return s;
  const detail = rest.join(" : ").trim();
  const label = reason.code === "autre" ? "Autre" : reason.label;
  return detail ? `${label} (${detail})` : label;
}

export type ExitAttendance = { startsAt: string; status: string }; // séances émargées (feuilles clôturées)
export type ExitContact = { contactedAt: string };

export type ExitTrace = {
  lastPresenceOn: string | null; // AAAA-MM-JJ (heure de Paris) de la dernière présence
  absencesInRow: number; // absences de suite avant la sortie (absences excusées ignorées)
  relances: string[]; // dates ISO des contacts notés depuis la première de ces absences
};

const parisDay = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

/**
 * Trace d'un parcours jusqu'à une date (la sortie, ou aujourd'hui pour un inscrit) : dernière
 * présence, série d'absences qui la suit, relances notées pendant cette série.
 */
export function exitTrace(attendances: readonly ExitAttendance[], contacts: readonly ExitContact[], until: string | null = null): ExitTrace {
  const limit = until ? `${until}T23:59:59Z` : null;
  const rows = attendances
    .filter((a) => a.status !== "excuse" && (!limit || a.startsAt <= limit))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let lastPresence: string | null = null;
  let firstAbsenceOfRun: string | null = null;
  let run = 0;
  for (const a of rows) {
    if (isAttended(a.status)) {
      lastPresence = a.startsAt;
      run = 0;
      firstAbsenceOfRun = null;
    } else if (a.status === "absent") {
      if (run === 0) firstAbsenceOfRun = a.startsAt;
      run += 1;
    }
  }
  const relances = firstAbsenceOfRun
    ? contacts
        .map((c) => c.contactedAt)
        .filter((d) => d >= firstAbsenceOfRun! && (!limit || d <= limit))
        .sort()
    : [];
  return { lastPresenceOn: lastPresence ? parisDay(lastPresence) : null, absencesInRow: run, relances };
}

/** Suggérer « passer en abandon — injoignable après relances » pour un inscrit. */
export function suggestDropout(trace: ExitTrace): boolean {
  return trace.absencesInRow >= DROPOUT_ABSENCES && trace.relances.length >= DROPOUT_RELANCES;
}

const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

/** « 3 absences de suite · 2 relances (10/11, 14/11) · dernière présence le 03/11/2026 » */
export function describeTrace(t: ExitTrace): string {
  const parts: string[] = [];
  if (t.absencesInRow) parts.push(`${t.absencesInRow} absence${t.absencesInRow > 1 ? "s" : ""} de suite`);
  parts.push(t.relances.length ? `${t.relances.length} relance${t.relances.length > 1 ? "s" : ""} (${t.relances.map(dayFr).join(", ")})` : "aucune relance notée");
  parts.push(t.lastPresenceOn ? `dernière présence le ${t.lastPresenceOn.split("-").reverse().join("/")}` : "aucune présence");
  return parts.join(" · ");
}

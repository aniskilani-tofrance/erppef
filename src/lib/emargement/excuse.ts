import type { AppRole } from "@/lib/auth";
import { EXCUSE_REASON_MAX, isAttended, type AttendanceStatus } from "@/lib/attendance-status";

// Règles du statut « Excusé » (absence justifiée). PUR : les Server Actions décident ici
// quoi écrire, puis écrivent. Testé sans base (tests/emargement/excuse.test.ts).

// Champs effacés quand une ligne quitte « Excusé ».
export const EXCUSE_CLEARED = { excuse_reason: null, excused_by: null, excused_at: null } as const;

/** Motif saisi : une ligne, espaces réduits, 200 caractères au plus ; vide → null. */
export function normalizeExcuseReason(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, EXCUSE_REASON_MAX) : null;
}

/**
 * Feuille OUVERTE : champs à écrire quand la formatrice (ou la coordination) pose un
 * statut à la main. « Absent » et « Excusé » effacent une éventuelle signature (choix
 * explicite : la personne n'était pas là) ; quitter « Excusé » efface motif et trace.
 */
export function openSheetStatusPatch(input: {
  status: AttendanceStatus;
  previousStatus: string | null;
  reason?: string | null;
  userId: string;
  now: Date;
}): Record<string, unknown> {
  const { status, previousStatus } = input;
  const leavingExcuse = previousStatus === "excuse" ? EXCUSE_CLEARED : {};
  if (status === "excuse") {
    return {
      status,
      signature: null,
      signed_at: null,
      method: "manuel",
      excuse_reason: normalizeExcuseReason(input.reason),
      excused_by: input.userId,
      excused_at: input.now.toISOString(),
    };
  }
  if (status === "absent") return { status, signature: null, signed_at: null, method: "manuel", ...leavingExcuse };
  return { status, ...leavingExcuse };
}

export const CLOSED_SHEET_ROLES: AppRole[] = ["admin", "coordinator"];

export type ClosedExcuseDecision =
  | { ok: true; patch: Record<string, unknown> | null } // null : déjà dans l'état demandé
  | { ok: false; error: string };

/**
 * Feuille CLÔTURÉE : l'admin et la coordination passent une ligne « Absent » en
 * « Excusé » (motif facultatif) ou reviennent à « Absent », sans rouvrir la feuille.
 * Le patch ne touche QUE le statut, le motif et la trace : jamais la signature, la
 * séance (clôture, contre-signature, lien) ni les autres lignes. Une ligne présente ou
 * en retard est refusée : ses heures changeraient, il faut rouvrir la feuille.
 */
export function planClosedSheetExcuse(input: {
  role: AppRole;
  closed: boolean;
  current: string | null; // statut actuel de la ligne (null : pas de ligne)
  excused: boolean; // true : « Excusé » ; false : retour à « Absent »
  reason?: string | null;
  userId: string;
  now: Date;
}): ClosedExcuseDecision {
  if (!CLOSED_SHEET_ROLES.includes(input.role)) {
    return { ok: false, error: "Sur une feuille clôturée, seule la coordination peut excuser une absence. Prévenez-la." };
  }
  if (!input.closed) {
    return { ok: false, error: "La feuille est encore ouverte : posez « Excusé » directement sur la feuille." };
  }
  if (!input.current) return { ok: false, error: "Aucune ligne d'émargement pour cette personne sur cette séance." };
  if (isAttended(input.current)) {
    return {
      ok: false,
      error: "Cette personne est notée présente : seule une absence peut être excusée. Pour changer une présence, rouvrez la feuille (« Rouvrir pour correction »).",
    };
  }
  if (input.excused) {
    return {
      ok: true,
      patch: {
        status: "excuse",
        excuse_reason: normalizeExcuseReason(input.reason),
        excused_by: input.userId,
        excused_at: input.now.toISOString(),
      },
    };
  }
  if (input.current !== "excuse") return { ok: true, patch: null };
  return { ok: true, patch: { status: "absent", ...EXCUSE_CLEARED } };
}

/** « excusé le 26/10 par Nadia » : trace discrète sous la ligne. */
export function excuseTraceLabel(excusedAt: string | null, byName: string | null): string | null {
  if (!excusedAt) return null;
  const day = new Date(excusedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
  const first = byName?.trim().split(/\s+/)[0];
  return `excusé le ${day}${first ? ` par ${first}` : ""}`;
}

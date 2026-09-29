// Séquences automatiques du tunnel POEI restauration.
//
// L'ERP est la seule horloge : une séquence part d'un point de départ (T0) posé par
// un statut ou un résultat d'appel, et ses étapes sont datées depuis ce T0. Le cron
// des leads (toutes les 15 minutes) exécute les étapes échues : une tâche pour le
// setter, un e-mail Brevo, un SMS Twilio. Rien n'est programmé à l'avance chez Brevo
// ni chez Twilio, si bien qu'un arrêt de séquence est immédiat et complet.
//
// Toutes les étapes partent à 10 h, heure de Paris. Une étape qui tomberait un samedi
// ou un dimanche est décalée au lundi : le week-end, un restaurateur est en plein rush
// et un message de relance y est perdu. Une étape en retard (cron arrêté, automatismes
// réactivés après une pause) part au prochain créneau d'envoi, jamais dans le même
// passage que la précédente : deux relances ne partent jamais le même jour.
//
// Ce module est pur (aucun accès à la base) : la mécanique se teste sans Supabase.

import { isoWeekday, localToUtc, nextDay, utcToLocalDate } from "@/lib/dates";
import { BREVO_LEAD_EVENTS, type BrevoLeadEvent } from "@/lib/leads/brevo";
import { isFinalStatus } from "@/lib/leads/status";
import type { SmsTemplateCode } from "@/lib/leads/templates";

export const SEQUENCE_KINDS = ["injoignable", "no_show", "proposition", "nurturing"] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];

export function isSequenceKind(value: unknown): value is SequenceKind {
  return typeof value === "string" && (SEQUENCE_KINDS as readonly string[]).includes(value);
}

export type SequenceAction =
  | { type: "email"; event: BrevoLeadEvent }
  | { type: "sms"; code: SmsTemplateCode };

export type SequenceStep = {
  code: string; // j1, j3, j6, j10, j30…
  label: string; // devient la « prochaine action » de la fiche jusqu'à l'échéance
  offsetDays: number;
  businessDays?: boolean; // J+2 ouvré : on ne compte que les jours de semaine
  actions: SequenceAction[]; // vide = une simple tâche pour le setter
};

export type SequenceDefinition = {
  kind: SequenceKind;
  label: string;
  trigger: string; // ce qui pose le T0
  steps: SequenceStep[];
  end: { offsetDays: number; task: string }; // la dernière tâche, une fois toutes les étapes parties
};

export const SEQUENCES: Record<SequenceKind, SequenceDefinition> = {
  injoignable: {
    kind: "injoignable",
    label: "Injoignable",
    trigger: "Un appel noté « messagerie » ou « barrage » sur un lead Nouveau, À rappeler ou Contacté (T0 = cet appel).",
    steps: [
      { code: "j1", label: "J+1 — rappeler à un autre créneau (matin ↔ coupure)", offsetDays: 1, actions: [] },
      { code: "j3", label: "J+3 — e-mail de relance n°3", offsetDays: 3, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.relanceJ3 }] },
      { code: "j6", label: "J+6 — appel + SMS « dernière tentative »", offsetDays: 6, actions: [{ type: "sms", code: "derniere_tentative" }] },
      { code: "j10", label: "J+10 — e-mail de rupture « je ferme votre dossier ? »", offsetDays: 10, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.dernierMessage }] },
    ],
    end: { offsetDays: 12, task: "Toujours sans réponse après J+10 : classer « Perdu — injoignable »" },
  },
  no_show: {
    kind: "no_show",
    label: "Rendez-vous manqué",
    trigger: "Le rendez-vous est noté « no-show » (T0 = ce constat). Le message du jour même part déjà à ce moment-là.",
    steps: [
      { code: "j1", label: "J+1 — e-mail n°7 après rendez-vous manqué", offsetDays: 1, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.noShowJ1 }] },
      { code: "j3", label: "J+3 — e-mail n°8, dernière relance après rendez-vous manqué", offsetDays: 3, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.noShowJ3 }] },
    ],
    end: { offsetDays: 5, task: "Sans nouveau créneau après J+3 : mettre en veille (nurturing) ou classer perdu" },
  },
  proposition: {
    kind: "proposition",
    label: "Proposition envoyée",
    trigger: "Le statut passe à « Proposition envoyée » (T0 = ce passage).",
    steps: [
      { code: "j2", label: "J+2 ouvré — e-mail n°11, avez-vous pu regarder la proposition ?", offsetDays: 2, businessDays: true, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.propositionJ2 }] },
      { code: "j7", label: "J+7 — e-mail n°12, décision ou mise en attente", offsetDays: 7, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.propositionJ7 }] },
    ],
    end: { offsetDays: 9, task: "Sans réponse à la proposition : appeler la direction, mettre en veille ou classer" },
  },
  nurturing: {
    kind: "nurturing",
    label: "En veille (nurturing)",
    trigger: "Le statut passe à « En veille (nurturing) » (T0 = ce passage).",
    steps: [
      { code: "j30", label: "J+30 — e-mail de veille, où en êtes-vous ?", offsetDays: 30, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.nurturingJ30 }] },
      { code: "j60", label: "J+60 — e-mail de veille, ce que retiennent les restaurateurs", offsetDays: 60, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.nurturingJ60 }] },
      { code: "j90", label: "J+90 — e-mail de veille, on garde le contact ?", offsetDays: 90, actions: [{ type: "email", event: BREVO_LEAD_EVENTS.nurturingJ90 }] },
    ],
    end: { offsetDays: 92, task: "Fin de la veille : réactiver par un appel ou classer perdu" },
  },
};

export function sequenceLabel(kind: string | null | undefined): string {
  return isSequenceKind(kind) ? SEQUENCES[kind].label : "—";
}

export function sequenceStepLabel(kind: string | null | undefined, code: string | null | undefined): string | null {
  if (!isSequenceKind(kind) || !code) return null;
  return SEQUENCES[kind].steps.find((s) => s.code === code)?.label ?? null;
}

const SEQUENCE_TASKS = new Set<string>(
  Object.values(SEQUENCES).flatMap((def) => [...def.steps.map((s) => s.label), def.end.task]),
);

/** Vrai si la « prochaine action » de la fiche a été posée par une séquence (et non par un conseiller). */
export function isSequenceTask(label: string | null | undefined): boolean {
  return Boolean(label && SEQUENCE_TASKS.has(label));
}

// ── Dates ────────────────────────────────────────────────────────────────────

export const SEQUENCE_SEND_TIME = "10:00";

function isWeekend(date: string): boolean {
  return isoWeekday(date) >= 6;
}

export function shiftToWeekday(date: string): string {
  let d = date;
  while (isWeekend(d)) d = nextDay(d);
  return d;
}

export function addCalendarDays(date: string, days: number): string {
  let d = date;
  for (let i = 0; i < days; i += 1) d = nextDay(d);
  return d;
}

export function addBusinessDays(date: string, days: number): string {
  let d = date;
  let left = days;
  while (left > 0) {
    d = nextDay(d);
    if (!isWeekend(d)) left -= 1;
  }
  return d;
}

/** Échéance d'une étape : T0 + décalage, à 10 h de Paris, jamais un week-end. */
export function stepDueAt(startedAt: string, step: { offsetDays: number; businessDays?: boolean }): string {
  const start = utcToLocalDate(startedAt);
  const day = step.businessDays ? addBusinessDays(start, step.offsetDays) : addCalendarDays(start, step.offsetDays);
  return localToUtc(shiftToWeekday(day), SEQUENCE_SEND_TIME);
}

/** Le prochain créneau d'envoi : demain 10 h, ou lundi si demain tombe un week-end. */
export function nextSendSlotAfter(now: Date): string {
  const tomorrow = nextDay(utcToLocalDate(now.toISOString()));
  return localToUtc(shiftToWeekday(tomorrow), SEQUENCE_SEND_TIME);
}

/** Une échéance déjà passée est reportée au prochain créneau d'envoi : jamais deux étapes le même jour. */
export function spaced(dueAt: string, now: Date): string {
  return Date.parse(dueAt) > now.getTime() ? dueAt : nextSendSlotAfter(now);
}

export function nextStepAfter(def: SequenceDefinition, executed: string | null | undefined): SequenceStep | null {
  const idx = executed ? def.steps.findIndex((s) => s.code === executed) : -1;
  return def.steps[idx + 1] ?? null;
}

export type SequencePlan =
  | { finished: false; step: SequenceStep; dueAt: string }
  | { finished: true; task: string; dueAt: string };

/** Ce qui suit l'étape `executed` (null = la séquence démarre) : l'étape suivante et son échéance, ou la tâche de fin. */
export function planAfter(def: SequenceDefinition, startedAt: string, executed: string | null | undefined, now: Date): SequencePlan {
  const next = nextStepAfter(def, executed);
  if (!next) return { finished: true, task: def.end.task, dueAt: spaced(stepDueAt(startedAt, def.end), now) };
  return { finished: false, step: next, dueAt: spaced(stepDueAt(startedAt, next), now) };
}

// ── Arrêts ───────────────────────────────────────────────────────────────────

export const SEQUENCE_STOP_REASONS = {
  reponse: "Le prospect a répondu",
  reservation: "Un créneau a été réservé",
  rdv_tenu: "Le rendez-vous a eu lieu",
  besoin_clos: "Besoin clos (gagné, perdu ou hors cible)",
  opposition: "Opposition du prospect",
  desinscription: "Désinscription par le lien Brevo",
  bounce_dur: "Adresse e-mail invalide (bounce dur)",
  numero_invalide: "Numéro de téléphone invalide",
  terminee: "Séquence terminée",
  remplacee: "Remplacée par une autre séquence",
  manuel: "Arrêtée par l'équipe",
} as const;
export type SequenceStopReason = keyof typeof SEQUENCE_STOP_REASONS;

export function stopReasonLabel(code: string | null | undefined): string {
  return (SEQUENCE_STOP_REASONS as Record<string, string>)[code ?? ""] ?? code ?? "—";
}

/** Motifs qui interdisent tout nouveau message automatique, quelle que soit la séquence. */
export const BLOCKING_STOP_REASONS: readonly SequenceStopReason[] = ["opposition", "desinscription", "bounce_dur"];

export type SequenceTransition =
  | { start: SequenceKind }
  | { startIfNone: SequenceKind }
  | { stop: SequenceStopReason }
  | null;

/** Ce qu'un changement de statut fait à la séquence en cours. */
export function transitionForStatus(status: string | null | undefined): SequenceTransition {
  switch (status) {
    case "proposition":
      return { start: "proposition" };
    case "nurturing":
      return { start: "nurturing" };
    case "gagne":
    case "perdu":
    case "hors_cible":
      return { stop: "besoin_clos" };
    case "rdv_pris":
      return { stop: "reservation" };
    case "rdv_tenu":
      return { stop: "rdv_tenu" };
    case "contacte":
    case "qualifie":
      return { stop: "reponse" };
    default:
      return null;
  }
}

/** Ce qu'un résultat noté au journal (appel, rendez-vous…) fait à la séquence en cours. */
export function transitionForOutcome(kind: string, outcome: string | null | undefined, status: string): SequenceTransition {
  switch (outcome) {
    case "joint":
    case "rappel_convenu":
      return { stop: "reponse" };
    case "rdv_tenu":
      return { stop: "rdv_tenu" };
    case "rdv_pose":
      return { stop: "reservation" };
    case "refus":
      return { stop: "besoin_clos" };
    case "no_show":
      return kind === "rdv" ? { start: "no_show" } : null;
    case "messagerie":
    case "barrage":
      return kind === "appel" && ["nouveau", "a_rappeler", "contacte"].includes(status) ? { startIfNone: "injoignable" } : null;
    default:
      return null;
  }
}

export type SequenceLeadState = {
  status: string;
  rdv_outcome?: string | null;
  opt_out_at?: string | null;
  email_status?: string | null;
};

/**
 * Avant chaque étape, le cron revérifie que la séquence a encore un sens. Une fiche
 * qui a bougé entre-temps (statut, réservation, opposition, retour Brevo) rend le
 * motif d'arrêt à appliquer ; null = la séquence continue.
 */
export function staleReason(kind: SequenceKind, lead: SequenceLeadState): SequenceStopReason | null {
  if (lead.opt_out_at) return "opposition";
  if (lead.email_status === "hard_bounce") return "bounce_dur";
  if (lead.email_status === "unsubscribed") return "desinscription";
  if (lead.email_status === "complaint") return "opposition";
  if (isFinalStatus(lead.status)) return "besoin_clos";
  const moved = (): SequenceStopReason => (lead.status === "rdv_pris" ? "reservation" : lead.status === "rdv_tenu" ? "rdv_tenu" : "reponse");
  switch (kind) {
    case "injoignable":
      return ["nouveau", "a_rappeler", "contacte"].includes(lead.status) ? null : moved();
    case "no_show":
      if (lead.status === "rdv_pris" || lead.rdv_outcome === "a_venir") return "reservation";
      if (lead.status === "rdv_tenu") return "rdv_tenu";
      return ["proposition", "nurturing"].includes(lead.status) ? "reponse" : null;
    case "proposition":
      return lead.status === "proposition" ? null : moved();
    case "nurturing":
      return lead.status === "nurturing" ? null : moved();
  }
}

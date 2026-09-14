import type { EvaluationKind } from "@/lib/evaluations/grid";

// Jalons d'évaluation d'un groupe, calculés d'après les séances planifiées :
//   • mi-parcours : la séance où l'on dépasse la moitié des heures planifiées ;
//   • finale : la dernière séance.
// Chacun est remplaçable par une date saisie sur le groupe (midterm_on / final_on).

const TZ = "Europe/Paris";

export type MilestoneSession = { starts_at: string; ends_at: string; status: string };

export type Milestone = { kind: EvaluationKind; on: string | null; auto: boolean };

export function localDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function hoursOf(s: MilestoneSession): number {
  return (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3600_000;
}

export function computeMilestones(
  sessions: MilestoneSession[],
  overrides: { midterm_on?: string | null; final_on?: string | null } = {},
): { midterm: Milestone; final: Milestone } {
  const active = sessions.filter((s) => s.status !== "annulee").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const total = active.reduce((n, s) => n + hoursOf(s), 0);
  let midAuto: string | null = null;
  let acc = 0;
  for (const s of active) {
    acc += hoursOf(s);
    if (acc >= total / 2) {
      midAuto = localDay(s.starts_at);
      break;
    }
  }
  const finalAuto = active.length ? localDay(active[active.length - 1].starts_at) : null;
  return {
    midterm: overrides.midterm_on ? { kind: "mi_parcours", on: overrides.midterm_on, auto: false } : { kind: "mi_parcours", on: midAuto, auto: true },
    final: overrides.final_on ? { kind: "finale", on: overrides.final_on, auto: false } : { kind: "finale", on: finalAuto, auto: true },
  };
}

export type MilestoneState = "sans_date" | "a_venir" | "bientot" | "a_faire" | "en_cours" | "faite";

/** État d'un jalon : à venir (> 7 j), bientôt (≤ 7 j), à faire (date passée, rien saisi), en cours, faite. */
export function milestoneState(on: string | null, today: string, done: number, expected: number): MilestoneState {
  if (!on) return "sans_date";
  if (expected > 0 && done >= expected) return "faite";
  if (done > 0) return "en_cours";
  const days = daysUntil(on, today);
  if (days > 7) return "a_venir";
  if (days >= 0) return "bientot";
  return "a_faire";
}

export function daysUntil(on: string, today: string): number {
  return Math.round((Date.parse(`${on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

export const STATE_LABELS: Record<MilestoneState, string> = {
  sans_date: "Pas de séance planifiée",
  a_venir: "À venir",
  bientot: "Cette semaine",
  a_faire: "À faire",
  en_cours: "En cours",
  faite: "Faite",
};

/** Palier de rappel à envoyer au formateur aujourd'hui : « j7 » à 7 jours ou moins, « j1 » la veille ou le jour même. */
export function reminderStage(on: string | null, today: string): "j7" | "j1" | null {
  if (!on) return null;
  const days = daysUntil(on, today);
  if (days < 0) return null;
  if (days <= 1) return "j1";
  if (days <= 7) return "j7";
  return null;
}

import { STAGES, STAGE_LABELS, type Stage } from "./constants";

// Transitions de statut d'un dossier. On avance dans le pipeline, on peut revenir d'un
// cran pour corriger une erreur, et on peut abandonner tant que rien n'est décidé.
export const STAGE_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  on_y_va: ["en_redaction", "abandonne"],
  en_redaction: ["on_y_va", "depose", "abandonne"],
  depose: ["en_redaction", "accorde", "refuse", "abandonne"],
  accorde: ["depose", "bilan_rendu"],
  refuse: ["depose", "on_y_va"],
  bilan_rendu: ["accorde"],
  abandonne: ["on_y_va", "en_redaction"],
};

export function canMoveStage(from: Stage, to: Stage): boolean {
  return from !== to && STAGE_TRANSITIONS[from].includes(to);
}

export function moveError(from: Stage, to: Stage): string | null {
  if (from === to) return "Le dossier est déjà dans ce statut.";
  if (!canMoveStage(from, to)) {
    return `Passage impossible de « ${label(from)} » à « ${label(to)} ». Depuis « ${label(from)} » : ${STAGE_TRANSITIONS[from].map(label).join(", ")}.`;
  }
  return null;
}

// Champs posés automatiquement lors d'un changement de statut.
export function stagePatch(to: Stage, today: string, current: { granted_on: string | null }): Record<string, unknown> {
  const patch: Record<string, unknown> = { stage: to };
  if (to === "accorde" && !current.granted_on) patch.granted_on = today;
  if (to === "refuse" || to === "abandonne" || to === "on_y_va" || to === "en_redaction" || to === "depose") {
    // Un accord annulé (retour en arrière) n'est plus compté dans les compteurs de l'année.
    if (current.granted_on) patch.granted_on = null;
  }
  return patch;
}

// Colonnes du pipeline, dans l'ordre d'affichage.
export const PIPELINE_COLUMNS: readonly Stage[] = STAGES;

// Un dossier « en cours » attend encore une action de l'équipe.
export function isActiveStage(s: Stage): boolean {
  return s === "on_y_va" || s === "en_redaction" || s === "depose";
}

function label(s: Stage): string {
  return STAGE_LABELS[s];
}

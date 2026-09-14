// Grille d'évaluation par compétence (référentiel CECRL) en trois crans, et échelle des
// niveaux utilisée par le positionnement et les évaluations de parcours.

export type EvaluationKind = "mi_parcours" | "finale";
export type SkillCode = "co" | "po" | "ce" | "pe";
export type Mark = "non_acquis" | "en_cours" | "acquis";

export const KIND_LABELS: Record<EvaluationKind, string> = { mi_parcours: "Mi-parcours", finale: "Finale" };

export const SKILLS: { code: SkillCode; label: string; short: string; hint: string }[] = [
  { code: "co", label: "Compréhension orale", short: "Comprendre", hint: "comprend des consignes, un dialogue simple, un message" },
  { code: "po", label: "Production orale", short: "Parler", hint: "se présente, demande, explique, interagit" },
  { code: "ce", label: "Compréhension écrite", short: "Lire", hint: "lit un panneau, un SMS, un formulaire, un texte court" },
  { code: "pe", label: "Production écrite", short: "Écrire", hint: "remplit un formulaire, écrit un message, un texte court" },
];

export const MARKS: { code: Mark; label: string; short: string }[] = [
  { code: "non_acquis", label: "Non acquis", short: "NA" },
  { code: "en_cours", label: "En cours d'acquisition", short: "EC" },
  { code: "acquis", label: "Acquis", short: "A" },
];

export const MARK_LABELS: Record<Mark, string> = { non_acquis: "Non acquis", en_cours: "En cours", acquis: "Acquis" };

// Échelle des niveaux (du positionnement infra-A1 au B2), dans l'ordre.
export const LEVEL_ORDER = ["Pré-alpha", "Alpha", "Alpha avancé", "Post-alpha (A1.1 en cours)", "A1.1", "A1", "A2", "B1", "B2"] as const;
export const CECRL_LEVELS = ["A1.1", "A1", "A2", "B1", "B2"] as const;

export function levelIndex(level: string | null | undefined): number {
  if (!level) return -1;
  const clean = level.replace(/\s*\(en cours\)\s*$/i, "").trim();
  return LEVEL_ORDER.findIndex((l) => l.toLowerCase() === clean.toLowerCase());
}

/** Niveau CECRL suivant (A1 → A2), null au-delà de B2 ou si inconnu. */
export function nextLevel(level: string | null | undefined): string | null {
  const i = CECRL_LEVELS.findIndex((l) => l === (level ?? "").trim());
  return i >= 0 && i < CECRL_LEVELS.length - 1 ? CECRL_LEVELS[i + 1] : null;
}

/** Vrai si `after` est strictement au-dessus de `before` sur l'échelle. */
export function hasProgressed(before: string | null | undefined, after: string | null | undefined): boolean {
  const a = levelIndex(before);
  const b = levelIndex(after);
  return a >= 0 && b >= 0 && b > a;
}

export type EvaluationGrid = { co: Mark | null; po: Mark | null; ce: Mark | null; pe: Mark | null };

export function gridComplete(g: Partial<EvaluationGrid> | null | undefined): boolean {
  return Boolean(g && SKILLS.every((s) => g[s.code]));
}

export type SkillSummary = { code: SkillCode; label: string; acquis: number; enCours: number; nonAcquis: number; total: number };

/** Répartition des crans par compétence sur un ensemble d'évaluations (les vides sont ignorés). */
export function summarizeSkills(evals: Partial<EvaluationGrid>[]): SkillSummary[] {
  return SKILLS.map((s) => {
    const marks = evals.map((e) => e[s.code]).filter((m): m is Mark => Boolean(m));
    return {
      code: s.code,
      label: s.label,
      acquis: marks.filter((m) => m === "acquis").length,
      enCours: marks.filter((m) => m === "en_cours").length,
      nonAcquis: marks.filter((m) => m === "non_acquis").length,
      total: marks.length,
    };
  });
}

/** Niveau proposé d'après le score d'un test ciblé sur `target` (≥ 70 % → niveau suivant acquis, ≥ 45 % → niveau visé atteint). */
export function suggestLevel(score: number, target: string): string {
  if (score >= 70) return nextLevel(target) ?? target;
  if (score >= 45) return target;
  return `${target} (en cours)`;
}

/** Cran proposé pour chaque compétence d'après un score global de test (à ajuster par la formatrice). */
export function suggestMark(score: number): Mark {
  if (score >= 70) return "acquis";
  if (score >= 45) return "en_cours";
  return "non_acquis";
}

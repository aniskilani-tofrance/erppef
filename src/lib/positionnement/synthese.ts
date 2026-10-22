// Ce que l'ÉQUIPE voit d'un test de positionnement (version ToFrance) sur la fiche apprenant :
// niveau par compétence, profil, palier « lire et écrire », mention « à confirmer ». Construit
// à partir de placement_tests.answers.rapport ; null pour les anciens tests (autre format) :
// leur affichage ne change pas. Pur : client et serveur.

export type CodeCompetence = "CO" | "CE" | "PO" | "PE" | "LANGUE";

export interface LigneCompetence {
  code: CodeCompetence;
  libelle: string;
  niveau: string;
  confiance: string | null;
  /** « corrigé par IA », « corrigé sans IA (simplifié) » ou null (correction automatique). */
  correction: string | null;
}

export interface SynthesePositionnement {
  global: string;
  explication: string;
  /** Règle du module : 3_sur_4, litteratie, fragile, aucune. */
  regle: string;
  competences: LigneCompetence[];
  litteratie: { palier: string; scolarisation: string | null };
  profil: string;
  /** Mention « à confirmer par un formateur ». */
  aConfirmer: boolean;
  /** Palier « Illettrisme probable » : scolarisé·e en français, n'est pas entré·e dans l'écrit. */
  illettrisme: boolean;
  abandon: boolean;
  version: string | null;
}

const LIBELLES: Record<CodeCompetence, string> = {
  CO: "Comprendre à l'oral",
  CE: "Comprendre à l'écrit",
  PO: "Parler (tâche faite à l'écrit)",
  PE: "Écrire",
  LANGUE: "Grammaire et vocabulaire (indicatif)",
};

// Libellés pour l'équipe (ceux du module s'adressent à la personne : « vous parlez… »).
const PROFILS: Record<string, string> = {
  oral_superieur_ecrit: "Oral plus avancé que l'écrit",
  ecrit_superieur_oral: "Écrit plus avancé que l'oral",
  homogene: "Profil équilibré entre l'oral et l'écrit",
  non_determine: "Profil à préciser en entretien",
};

const SCOLARISATION: Record<string, string> = {
  jamais: "jamais allé·e à l'école",
  un_peu: "un peu d'école",
  longtemps: "école longtemps",
};

const CORRECTION: Record<string, string> = { ia: "corrigé par IA", repli: "corrigé sans IA (simplifié)" };

export const MENTION_EQUIPE =
  "Repérage à confirmer par un formateur (entretien oral). Ce n'est pas une certification (DELF, TCF).";

export function libelleNiveauTest(n: unknown): string {
  if (typeof n !== "string" || !n) return "—";
  if (n === "infra_A1") return "A1 non atteint";
  if (n === "non_evalue") return "Non évalué";
  return n;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Synthèse d'un test v2 à partir de sa colonne answers (ou directement du rapport). */
export function synthesePositionnement(answersOuRapport: unknown): SynthesePositionnement | null {
  const a = obj(answersOuRapport);
  const r = obj(a?.rapport) ?? (a && obj(a.global) && obj(a.competences) ? a : null);
  if (!r) return null;
  const global = obj(r.global);
  const comps = obj(r.competences);
  if (!global || !comps) return null;

  const ligne = (code: CodeCompetence, c: Obj | null): LigneCompetence => ({
    code,
    libelle: LIBELLES[code],
    niveau: libelleNiveauTest(c?.niveau),
    confiance: c && c.niveau !== "non_evalue" ? str(c.confiance) : null,
    correction: CORRECTION[str(c?.mode) ?? ""] ?? null,
  });
  const lit = obj(r.litteratie);
  const palier = str(lit?.palier) ?? "non_evalue";
  const profil = obj(r.profil);
  return {
    global: libelleNiveauTest(global.niveau),
    explication: str(global.explication) ?? "",
    regle: str(global.regle) ?? "",
    competences: [
      ...(["CO", "CE", "PO", "PE"] as const).map((c) => ligne(c, obj(comps[c]))),
      ligne("LANGUE", obj(r.langue)),
    ],
    litteratie: { palier: libelleNiveauTest(palier), scolarisation: SCOLARISATION[str(lit?.scolarisation) ?? ""] ?? null },
    profil: PROFILS[str(profil?.type) ?? ""] ?? PROFILS.non_determine,
    // Toujours un repérage : à confirmer en entretien (sauf abandon : rien à confirmer).
    aConfirmer: a?.interface_abandon !== true && global.niveau !== "non_evalue",
    illettrisme: palier === "Illettrisme probable",
    abandon: a?.interface_abandon === true,
    version: str(r.version),
  };
}

/** Une ligne de texte (dossier d'entrée PDF, assistant) : « CO A2 · CE A1 · PO A2 · PE A1 ». */
export function resumeCompetences(s: SynthesePositionnement): string {
  return s.competences
    .filter((c) => c.code !== "LANGUE")
    .map((c) => `${c.code} ${c.niveau}`)
    .join(" · ");
}

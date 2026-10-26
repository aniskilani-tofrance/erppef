// Types du module « test de positionnement » (français, CECRL A1→B2 + littératie).
// Module AUTONOME : TypeScript pur, aucune dépendance (ni React, ni Next.js, ni Deno, ni Supabase).
// Imports avec l'extension « .ts » : lisible tel quel par Deno (fonctions edge), Vite et Next.js.

export type Niveau = "A1" | "A2" | "B1" | "B2";
export const NIVEAUX: Niveau[] = ["A1", "A2", "B1", "B2"];

/** Les 4 compétences du CECRL et du DELF. */
export type Competence4 = "CO" | "CE" | "PO" | "PE";
export const COMPETENCES_4: Competence4[] = ["CO", "CE", "PO", "PE"];
/** + Langue (grammaire, vocabulaire : informatif) et Littératie (entrée dans l'écrit). */
export type Competence = Competence4 | "LANGUE" | "LITTERATIE";

export const LIBELLES_COMPETENCE: Record<Competence, string> = {
  CO: "Comprendre à l'oral",
  CE: "Comprendre à l'écrit",
  PO: "Parler",
  PE: "Écrire",
  LANGUE: "Grammaire et vocabulaire",
  LITTERATIE: "Lire et écrire (entrée dans l'écrit)",
};

/** Résultat d'une compétence : un niveau CECRL, ou « A1 non atteint », ou non évaluée. */
export type NiveauResultat = Niveau | "infra_A1" | "non_evalue";

export type Confiance = "faible" | "moyenne" | "bonne";

/** Comment le résultat a été obtenu. */
export type ModeEvaluation = "automatique" | "ia" | "repli" | "formateur";

export type TypeItem =
  | "listen_choose" | "fill_in_blank" | "fill_keyboard" | "complete_dialogue" | "safety_instruction"
  | "scenario_tree" | "reformulate" | "written" | "oral" | "match_pairs" | "read_comprehension"
  | "order_sentences" | "true_false_justify" | "complete_form" | "word_choice_text" | "categorize"
  | "odd_one_out" | "sentence_builder" | "email_response" | "big_choice";

export const TYPES_LIBRES: TypeItem[] = ["written", "oral", "reformulate"];

/**
 * Un item. Champ libre volontairement large : la banque vient d'un outil existant et chaque type
 * a ses propres champs. Les champs SECRETS (bonnes réponses) sont retirés par `itemsPublics`.
 */
export interface Item {
  id: number;
  level: string; // Niveau CECRL ou palier de littératie (Pré-alpha, Alpha, A1.1)
  competence: Competence;
  type: TypeItem | string;
  question: string;
  category?: string;
  timeLimit?: number | null;
  /** Durée maximale d'enregistrement (oral) en secondes. */
  dureeMax?: number;
  /** Item dont la réponse se devine surtout par le bon sens (audit du 15/10) : jamais prioritaire. */
  savoirEtre?: boolean;
  /** Nouvel item non encore relu par un formateur. */
  relecture?: "a_relire" | "relu";
  auteur?: string;
  /** Rang de choix dans le parcours adaptatif (plus petit = proposé d'abord). */
  priorite?: number;
  audioText?: string;
  options?: string[];
  correct?: string | number;
  acceptedAnswers?: string[];
  criteria?: string[];
  minWords?: number;
  minDuration?: number;
  // Champs propres à certains types (formulaires, textes, appariements…)
  [champ: string]: unknown;
}

/** Réponses brutes, indexées par identifiant d'item. */
export type Reponses = Record<number, string>;

export interface NoteCritere {
  critere: string;
  points: number;
  max: number;
}

/** Évaluation d'une production libre (écrit ou oral) avec la grille. */
export interface EvaluationLibre {
  itemId: number;
  competence: "PO" | "PE";
  niveauVise: Niveau;
  /** Tâche réussie au niveau visé (total ≥ 60 % de la grille et réalisation de la tâche > 0). */
  reussi: boolean;
  total: number;
  max: number;
  criteres: NoteCritere[];
  commentaire: string;
  mode: "ia" | "repli";
  /** Toujours vrai : un résultat d'IA ou de repli se confirme par un formateur. */
  a_confirmer: true;
}

export interface ItemCorrige {
  itemId: number;
  competence: Competence;
  niveau: string;
  correct: boolean;
  /** Poids dans le score de la compétence (0,5 pour un item « savoir-être »). */
  poids: number;
  evaluation?: EvaluationLibre;
}

export interface ResultatCompetence {
  competence: Competence;
  niveau: NiveauResultat;
  /** Score par niveau testé : réussis / passés (pondérés). */
  parNiveau: Partial<Record<Niveau, { reussis: number; passes: number }>>;
  itemsPasses: number;
  confiance: Confiance;
  mode: ModeEvaluation;
  a_confirmer: boolean;
  jePeux: string[];
}

export type ProfilType = "oral_superieur_ecrit" | "ecrit_superieur_oral" | "homogene" | "non_determine";

export interface ResultatLitteratie {
  /** null = lecture-compréhension A1.1 acquise : la personne est entrée dans l'écrit. */
  palier: "Pré-alpha" | "Alpha" | "Alpha avancé" | "Post-alpha (A1.1 en cours)" | "Illettrisme probable" | "A1.1 acquis" | "non_evalue";
  oralDeBase: boolean | null;
  scolarisation: "jamais" | "un_peu" | "longtemps" | "inconnue";
  itemsPasses: number;
}

/**
 * Règle qui donne le niveau global (voir profil.ts) :
 * - « 3_sur_4 » : plus haut niveau atteint dans au moins 3 des 4 compétences ;
 * - « litteratie » : arrêt au bloc « lire et écrire » (L0 raté) → palier de lecture ;
 * - « palier_litteratie_oral » (23/10) : L1 ou L2 raté, test continué, lecture A1 non atteinte →
 *   palier de lecture + niveau à l'oral ;
 * - « fragile » : moins de 3 compétences évaluées ; « aucune » : pas de niveau.
 */
export type RegleGlobal = "3_sur_4" | "litteratie" | "palier_litteratie_oral" | "fragile" | "aucune";

export interface Rapport {
  /** Version de la banque d'items (VERSION_BANQUE). */
  version: string;
  /** Version des règles du parcours (VERSION_PARCOURS, depuis le 23/10 ; absente avant). */
  versionParcours?: string;
  date: string;
  dureeSecondes: number;
  competences: Record<Competence4, ResultatCompetence>;
  langue: ResultatCompetence;
  litteratie: ResultatLitteratie;
  global: {
    niveau: NiveauResultat | ResultatLitteratie["palier"];
    regle: RegleGlobal | string;
    explication: string;
    /**
     * Niveau à l'oral, présent quand le global est un palier de lecture (règles « litteratie » et
     * « palier_litteratie_oral ») : le plus bas de CO et PO mesurés (voir `niveauOral`, profil.ts).
     * Affichage : `libelleGlobal` → « Alpha avancé · oral B1 ».
     */
    niveauOral?: NiveauResultat;
  };
  profil: { type: ProfilType; libelle: string };
  recommandations: string[];
  a_confirmer: boolean;
  mention: string;
}

import { z } from "zod";
import type { Portal } from "./constants";

// Module « Financements », lot 2 : l'atelier d'écriture. Logique PURE, testée sans base.
// Un dossier se rédige rubrique par rubrique, dans l'ordre du formulaire du financeur ;
// chaque rubrique se copie d'un clic pour être collée dans le portail.

// ── Modèles de rubriques ─────────────────────────────────────────────────────
export const TEMPLATE_KEYS = ["dauphin_pdv", "cerfa_12156", "region", "fondation", "libre"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type TemplateSection = { title: string; guidance: string };
export type SectionTemplate = { key: TemplateKey; label: string; hint: string; sections: TemplateSection[] };

// Les limites de caractères ne sont PAS dans les modèles : elles changent d'un appel à
// l'autre, on les saisit sur la rubrique d'après le formulaire réel.
export const SECTION_TEMPLATES: Record<TemplateKey, SectionTemplate> = {
  dauphin_pdv: {
    key: "dauphin_pdv",
    label: "Politique de la ville (Dauphin)",
    hint: "Les rubriques de la demande sur Dauphin, dans l'ordre de la saisie.",
    sections: [
      { title: "Objectifs de l'action", guidance: "Ce que l'action vise, en lien avec les priorités du contrat de ville. Deux à quatre objectifs concrets et vérifiables." },
      { title: "Description de l'action", guidance: "Ce qui se passe concrètement : contenu, déroulement, rythme, lieux, durée." },
      { title: "Public visé", guidance: "Qui bénéficie de l'action : nombre de personnes, âges, part de femmes, quartiers prioritaires concernés. Des chiffres agrégés, jamais de nom." },
      { title: "Moyens humains", guidance: "Qui intervient : fonctions, temps passé, bénévoles. Des fonctions, pas des noms." },
      { title: "Partenaires", guidance: "Qui oriente le public, qui accueille l'action, qui la cofinance." },
      { title: "Évaluation", guidance: "Comment l'action est suivie puis évaluée : outils, moments, personnes chargées du suivi." },
      { title: "Critères de réussite", guidance: "Des indicateurs chiffrés, avec la valeur visée. Vérifiez dans l'appel le nombre d'indicateurs exigé." },
    ],
  },
  cerfa_12156: {
    key: "cerfa_12156",
    label: "Demande de subvention (Cerfa 12156, Le Compte Asso)",
    hint: "Les rubriques « projet » du formulaire unique de demande de subvention.",
    sections: [
      { title: "Intitulé du projet", guidance: "Un titre court, qui dit l'action et son public." },
      { title: "Objectifs", guidance: "À quoi sert le projet : les résultats attendus pour le public." },
      { title: "Description", guidance: "Ce qui est fait, comment, avec quel déroulement." },
      { title: "Bénéficiaires", guidance: "Qui et combien : nombre de personnes, caractéristiques du public. Des chiffres agrégés, jamais de nom." },
      { title: "Territoire", guidance: "Où l'action se déroule : quartier, commune, département." },
      { title: "Moyens matériels et humains", guidance: "Locaux, matériel, salariés, bénévoles affectés au projet." },
      { title: "Date ou période de réalisation", guidance: "Début, fin, rythme." },
      { title: "Évaluation : indicateurs proposés", guidance: "Les indicateurs retenus au regard des objectifs, avec la valeur visée." },
    ],
  },
  region: {
    key: "region",
    label: "Région (Mes démarches)",
    hint: "Les champs habituels d'un appel à projets régional. Ajoutez ceux que l'appel demande en plus.",
    sections: [
      { title: "Résumé du projet", guidance: "L'essentiel en quelques lignes : pour qui, quoi, où, avec quel résultat." },
      { title: "Le besoin", guidance: "Le constat de départ, avec des faits et des chiffres du territoire." },
      { title: "Le public", guidance: "Qui est concerné, combien de personnes, comment elles arrivent jusqu'à l'action." },
      { title: "Les actions", guidance: "Ce qui est fait, étape par étape." },
      { title: "Les partenaires", guidance: "Qui fait quoi autour du projet." },
      { title: "Les indicateurs", guidance: "Ce qui sera mesuré, et la valeur visée." },
      { title: "Le calendrier", guidance: "Les grandes étapes sur la durée du projet." },
    ],
  },
  fondation: {
    key: "fondation",
    label: "Fondation ou mécénat",
    hint: "Un formulaire de fondation est souvent court : aller droit à l'impact.",
    sections: [
      { title: "Présentation de l'association", guidance: "Qui nous sommes, depuis quand, pour qui, avec quels résultats." },
      { title: "Le besoin", guidance: "Le problème auquel le projet répond, raconté simplement, avec un ou deux chiffres." },
      { title: "Le projet", guidance: "Ce que le soutien permet de faire, concrètement." },
      { title: "Le public", guidance: "Qui en bénéficie et combien de personnes." },
      { title: "L'impact attendu", guidance: "Ce qui aura changé pour les personnes, et comment on le saura." },
      { title: "Le calendrier", guidance: "Quand le projet démarre et quelles sont ses étapes." },
      { title: "Les partenaires", guidance: "Avec qui le projet est mené." },
      { title: "L'utilisation du soutien demandé", guidance: "À quoi sert précisément la somme demandée." },
    ],
  },
  libre: {
    key: "libre",
    label: "Dossier libre",
    hint: "Aucune rubrique au départ : ajoutez celles du formulaire, dans son ordre.",
    sections: [],
  },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);
}

// Modèle proposé d'office d'après le portail de dépôt du dossier.
export function defaultTemplateForPortal(portal: Portal | null | undefined): TemplateKey | null {
  switch (portal) {
    case "dauphin":
      return "dauphin_pdv";
    case "compte_asso":
      return "cerfa_12156";
    case "mesdemarches_idf":
      return "region";
    case "plateforme_fondation":
      return "fondation";
    default:
      return null;
  }
}

// ── Longueur et avancement ───────────────────────────────────────────────────
// Les portails comptent les caractères, espaces comprises ; un retour à la ligne compte
// pour un caractère (Windows en envoie deux : on normalise).
export function countChars(text: string | null | undefined): number {
  return (text ?? "").replace(/\r\n/g, "\n").length;
}

export type SectionState = "vide" | "ok" | "trop_long";
export function sectionState(content: string | null | undefined, maxChars: number | null | undefined): SectionState {
  if (!(content ?? "").trim()) return "vide";
  if (maxChars && countChars(content) > maxChars) return "trop_long";
  return "ok";
}

export type SectionLite = { title: string; content: string; max_chars: number | null };
export function applicationProgress(sections: SectionLite[]): { total: number; filled: number; tooLong: number } {
  let filled = 0;
  let tooLong = 0;
  for (const s of sections) {
    const st = sectionState(s.content, s.max_chars);
    if (st !== "vide") filled++;
    if (st === "trop_long") tooLong++;
  }
  return { total: sections.length, filled, tooLong };
}

// Ajoute un texte à la suite d'une rubrique (bloc de la bibliothèque, chiffres), séparé par une ligne vide.
export function appendText(content: string | null | undefined, addition: string): string {
  const base = (content ?? "").replace(/\s+$/, "");
  const add = addition.trim();
  if (!add) return base;
  return base ? `${base}\n\n${add}` : add;
}

// Le dossier entier en texte simple (« Tout copier », et base de l'export Word).
export function assembleText(title: string, sections: SectionLite[]): string {
  const parts = [title.trim()];
  for (const s of sections) {
    parts.push(`${s.title.trim()}\n${(s.content ?? "").trim() || "(à rédiger)"}`);
  }
  return parts.join("\n\n");
}

// Échange deux rubriques voisines : rend les nouvelles positions (0, 1, 2…) par id.
export function reorder(ids: string[], id: string, direction: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── Bibliothèque de textes ───────────────────────────────────────────────────
export const BLOCK_CATEGORIES = ["presentation", "action", "public", "equipe", "partenaires", "chiffres", "reponse", "autre"] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];
export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  presentation: "Présentation de l'association",
  action: "Description d'une action",
  public: "Public",
  equipe: "Équipe et moyens",
  partenaires: "Partenaires",
  chiffres: "Chiffres clés",
  reponse: "Réponse déjà acceptée",
  autre: "Autre",
};

// ── Écriture avec l'IA : les demandes possibles ──────────────────────────────
export const AI_MODES = ["rediger", "raccourcir", "concret", "fondation", "simple"] as const;
export type AiMode = (typeof AI_MODES)[number];
export const AI_MODE_LABELS: Record<AiMode, string> = {
  rediger: "Rédiger",
  raccourcir: "Plus court",
  concret: "Plus concret",
  fondation: "Adapter à une fondation",
  simple: "Français plus simple",
};
// Les réécritures partent du texte existant : sans texte, seule « Rédiger » a un sens.
export function modeNeedsText(mode: AiMode): boolean {
  return mode !== "rediger";
}

// ── Formulaires ──────────────────────────────────────────────────────────────
const blank = (v: string | null | undefined) => (v ?? "").trim() || null;

export const MAX_SECTION_CHARS = 20_000; // garde-fou de saisie, bien au-delà de tout formulaire
export const MAX_SECTIONS = 40;

export const sectionFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre de la rubrique est obligatoire.").max(200, "200 caractères maximum pour le titre."),
  guidance: z.string().max(2000, "2 000 caractères maximum pour la consigne.").optional().nullable(),
  max_chars: z.union([z.string(), z.number()]).optional().nullable(),
});

export function sectionRowFromForm(raw: unknown): { title: string; guidance: string | null; max_chars: number | null } {
  const p = sectionFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Rubrique incomplète.");
  const m = p.data.max_chars;
  let max: number | null = null;
  if (m !== null && m !== undefined && String(m).trim() !== "") {
    const n = Number(String(m).replace(/\s/g, ""));
    if (!Number.isInteger(n) || n <= 0 || n > 100_000) throw new Error("Limite invalide : un nombre entier de caractères est attendu.");
    max = n;
  }
  return { title: p.data.title, guidance: blank(p.data.guidance), max_chars: max };
}

export function cleanContent(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Texte attendu.");
  const text = raw.replace(/\r\n/g, "\n");
  if (text.length > MAX_SECTION_CHARS) throw new Error(`Texte trop long : ${MAX_SECTION_CHARS.toLocaleString("fr-FR")} caractères maximum.`);
  return text;
}

export const blockFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre du texte est obligatoire.").max(200, "200 caractères maximum pour le titre."),
  category: z.enum(BLOCK_CATEGORIES),
  content: z.string().trim().min(1, "Le texte est vide.").max(MAX_SECTION_CHARS, "Texte trop long."),
});

export function blockRowFromForm(raw: unknown): { title: string; category: BlockCategory; content: string } {
  const p = blockFormSchema.safeParse(raw);
  if (!p.success) throw new Error(p.error.issues[0]?.message ?? "Texte incomplet.");
  return { title: p.data.title, category: p.data.category, content: p.data.content.replace(/\r\n/g, "\n") };
}

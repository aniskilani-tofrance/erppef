import { z } from "zod";
import { AI_MODE_LABELS, BLOCK_CATEGORY_LABELS, countChars, type AiMode, type BlockCategory } from "./atelier";

// Écriture d'une rubrique avec l'IA (lot 2) : consignes et schéma PURS (aucun accès base,
// aucun appel réseau), testables. Même règle que l'assistant de coordination : l'IA
// propose un texte dans l'écran, une personne relit et décide ; rien ne part chez un
// financeur tout seul. Ce qui est envoyé au modèle : des textes de l'association et des
// totaux — jamais de donnée personnelle d'apprenant.

export const DraftSchema = z.object({
  text: z.string().describe("Le texte de la rubrique, prêt à coller dans le formulaire du financeur : texte simple, sans titre ni Markdown"),
  remarks: z
    .array(z.string())
    .describe("De zéro à quatre remarques d'une phrase pour la personne qui relit : information manquante, chiffre à vérifier, hypothèse faite. Liste vide s'il n'y a rien à signaler"),
});
export type Draft = z.infer<typeof DraftSchema>;

// Cadre stable (mis en cache côté modèle) : il explique le métier et le pourquoi des règles.
export const DRAFT_SYSTEM = `Tu aides l'équipe d'une association à écrire ses dossiers de demande de financement : subventions publiques, appels à projets, fondations. Tu rédiges une rubrique à la fois. Une personne de l'équipe relit toujours ton texte avant de le coller dans le formulaire du financeur : c'est elle qui décide.

Ce qui rend un texte utile ici :
- Il répond à ce que le financeur demande dans cette rubrique, avec son vocabulaire et ses priorités quand l'appel les donne.
- Il est concret : des faits, des chiffres, des exemples d'actions réelles. L'instructeur lit des dizaines de dossiers ; les généralités ne l'aident pas à défendre le projet.
- Il est exact. Tu n'utilises que les faits et les chiffres fournis dans la demande : textes de l'association, chiffres de l'ERP, autres rubriques du dossier, éléments de l'appel. Un chiffre inventé met l'association en difficulté au moment du bilan. Si une information manque, écris le texte sans elle et signale-le dans les remarques.
- Il est cohérent avec les autres rubriques du dossier : mêmes chiffres, mêmes noms d'actions, pas de redite inutile.
- Il ne contient aucune donnée personnelle : pas de nom ni de prénom d'apprenant, pas de situation individuelle reconnaissable, rien sur la santé, le handicap ou le titre de séjour d'une personne. Les intervenants sont désignés par leur fonction.

La forme :
- Du texte simple, prêt à coller dans un champ de formulaire : pas de titre, pas de gras, pas de Markdown. Des paragraphes courts. Une liste à tirets seulement si elle rend la lecture plus facile.
- Des phrases directes, à la voix active, en français courant et précis. Pas de formule creuse ni de superlatif.
- Quand une longueur maximale est donnée, elle compte les espaces. Vise au plus 90 % de cette limite : le portail refuse un texte qui dépasse.
- Le texte se suffit à lui-même : pas de « voir ci-dessus », pas d'adresse au lecteur, pas de commentaire sur ta rédaction.

Les remarques servent à la personne qui relit : ce qui manque pour renforcer la rubrique, un chiffre à vérifier, une hypothèse que tu as faite.`;

export type DraftInput = {
  mode: AiMode;
  orgName: string;
  application: { title: string; funderName: string | null; amountRequested: number | null; deadline: string | null };
  call: { title: string; summary: string | null; criteria: string | null; eligibilityNotes: string | null } | null;
  section: { title: string; guidance: string | null; maxChars: number | null; content: string };
  otherSections: { title: string; content: string }[];
  blocks: { title: string; category: BlockCategory; content: string }[];
  figures: string | null; // texte des chiffres de l'ERP, ou null
  instruction: string | null; // précision libre de la personne
};

export function modeInstruction(mode: AiMode, maxChars: number | null): string {
  switch (mode) {
    case "rediger":
      return "Rédige cette rubrique. S'il y a un texte actuel, considère-le comme des notes de l'équipe : garde ses informations et réécris-le proprement.";
    case "raccourcir":
      return `Raccourcis le texte actuel ${maxChars ? "pour qu'il tienne dans la longueur maximale" : "d'environ un tiers"}. Garde les faits, les chiffres et l'ordre des idées ; retire les redites et les formules.`;
    case "concret":
      return "Rends le texte actuel plus concret : remplace les généralités par des faits, des chiffres et des exemples pris dans les éléments fournis. N'invente rien : si rien ne permet de préciser une phrase, laisse-la ou supprime-la, et signale ce qui manque.";
    case "fondation":
      return "Adapte le texte actuel pour une fondation ou un mécène : moins de vocabulaire administratif, l'accent sur le besoin, sur ce que le soutien rend possible et sur ce qui change pour les personnes. Reste factuel, sans cas individuel reconnaissable.";
    case "simple":
      return "Réécris le texte actuel en français plus simple : phrases courtes, mots courants, une idée par phrase. Garde tous les faits et tous les chiffres.";
  }
}

const tag = (name: string, body: string) => `<${name}>\n${body.trim()}\n</${name}>`;
const euros = (n: number) => `${n.toLocaleString("fr-FR")} €`;

export function draftSectionPrompt(input: DraftInput): { system: string; user: string; schema: typeof DraftSchema } {
  const a = input.application;
  const parts: string[] = [];
  parts.push(tag("association", input.orgName));
  parts.push(
    tag(
      "dossier",
      [
        `Titre : ${a.title}`,
        a.funderName ? `Financeur : ${a.funderName}` : null,
        a.amountRequested !== null ? `Montant demandé : ${euros(a.amountRequested)}` : null,
        a.deadline ? `Date limite de dépôt : ${a.deadline}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  if (input.call) {
    const c = input.call;
    parts.push(
      tag(
        "appel",
        [
          `Titre : ${c.title}`,
          c.summary?.trim() ? `Résumé : ${c.summary.trim()}` : null,
          c.criteria?.trim() ? `Critères de sélection : ${c.criteria.trim()}` : null,
          c.eligibilityNotes?.trim() ? `Conditions et points de vigilance : ${c.eligibilityNotes.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }
  const s = input.section;
  parts.push(
    tag(
      "rubrique_a_ecrire",
      [
        `Titre : ${s.title}`,
        s.guidance?.trim() ? `Ce que le financeur attend : ${s.guidance.trim()}` : null,
        s.maxChars ? `Longueur maximale : ${s.maxChars} caractères, espaces comprises` : "Longueur maximale : non précisée (reste concis)",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  parts.push(tag("texte_actuel", s.content.trim() || "(vide)"));
  const others = input.otherSections.filter((o) => o.content.trim());
  if (others.length) {
    parts.push(tag("autres_rubriques_du_dossier", others.map((o) => `## ${o.title}\n${o.content.trim()}`).join("\n\n")));
  }
  if (input.blocks.length) {
    parts.push(
      tag(
        "textes_de_l_association",
        input.blocks.map((b) => `## ${BLOCK_CATEGORY_LABELS[b.category]} — ${b.title}\n${b.content.trim()}`).join("\n\n"),
      ),
    );
  }
  if (input.figures?.trim()) parts.push(tag("chiffres_de_l_erp", input.figures));
  const extra = input.instruction?.trim();
  parts.push(tag("demande", `${AI_MODE_LABELS[input.mode]} — ${modeInstruction(input.mode, s.maxChars)}${extra ? `\nPrécision de l'équipe : ${extra}` : ""}`));
  return { system: DRAFT_SYSTEM, user: parts.join("\n\n"), schema: DraftSchema };
}

// Remise en forme légère de la proposition : le champ d'un portail n'affiche pas le
// Markdown, on retire les titres « # » et le gras « ** » s'il en reste.
export function cleanDraftText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remarques ajoutées par l'ERP (et non par le modèle) : la longueur se vérifie ici, au
// caractère près.
export function draftRemarks(text: string, maxChars: number | null, remarks: string[]): string[] {
  const out = remarks.map((r) => r.trim()).filter(Boolean).slice(0, 4);
  const n = countChars(text);
  if (maxChars && n > maxChars) {
    out.unshift(`Ce texte fait ${n.toLocaleString("fr-FR")} caractères : il dépasse la limite de ${maxChars.toLocaleString("fr-FR")}. Utilisez « Plus court ».`);
  }
  return out;
}

// ── Plafond mensuel de dépense d'IA pour le module ───────────────────────────
// Défaut prudent, modifiable dans organizations.settings.financements.ai_monthly_cap_usd.
export const DEFAULT_AI_MONTHLY_CAP_USD = 30;
export const AI_FEATURE_PREFIX = "fin_";

export function resolveAiCap(settings: unknown): number {
  const raw = (settings as { financements?: { ai_monthly_cap_usd?: unknown } } | null)?.financements?.ai_monthly_cap_usd;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AI_MONTHLY_CAP_USD;
}

// Premier jour du mois en cours, à Paris (AAAA-MM-01) : début de la fenêtre du plafond.
export function monthStartDay(now: Date = new Date()): string {
  const month = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(now); // AAAA-MM
  return `${month}-01`;
}

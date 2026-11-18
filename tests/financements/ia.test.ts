import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_MONTHLY_CAP_USD, DRAFT_SYSTEM, DraftSchema, cleanDraftText, draftRemarks, draftSectionPrompt, modeInstruction, monthStartDay,
  resolveAiCap, type DraftInput,
} from "@/lib/financements/ia";
import { AI_MODES } from "@/lib/financements/atelier";

const base: DraftInput = {
  mode: "rediger",
  orgName: "Association Exemple",
  application: { title: "Agir par les mots 2027", funderName: "Préfecture", amountRequested: 6000, deadline: "1 décembre 2026" },
  call: { title: "Politique de la ville 2027", summary: "Appel annuel.", criteria: "Priorité à l'emploi des femmes.", eligibilityNotes: null },
  section: { title: "Objectifs de l'action", guidance: "Deux à quatre objectifs.", maxChars: 1500, content: "" },
  otherSections: [
    { title: "Public visé", content: "40 personnes, dont 28 femmes." },
    { title: "Partenaires", content: "  " },
  ],
  blocks: [{ title: "Présentation courte", category: "presentation", content: "Créée en 2021, l'association enseigne le français." }],
  figures: "Chiffres de l'ERP — Année civile 2026 :\n- 46 personnes accompagnées",
  instruction: "Insister sur l'emploi.",
};

describe("IA — consigne d'écriture d'une rubrique", () => {
  it("le cadre dit de ne rien inventer, de ne citer personne et d'écrire du texte simple", () => {
    expect(DRAFT_SYSTEM).toContain("Tu n'utilises que les faits et les chiffres fournis");
    expect(DRAFT_SYSTEM).toContain("aucune donnée personnelle");
    expect(DRAFT_SYSTEM).toContain("pas de Markdown");
    expect(DRAFT_SYSTEM).toContain("c'est elle qui décide");
  });

  it("la demande réunit le dossier, l'appel, la rubrique, les autres rubriques, les textes et les chiffres", () => {
    const { system, user, schema } = draftSectionPrompt(base);
    expect(system).toBe(DRAFT_SYSTEM);
    expect(schema).toBe(DraftSchema);
    for (const piece of [
      "<association>", "Association Exemple", "Titre : Agir par les mots 2027", "Financeur : Préfecture", "Montant demandé : 6", "Date limite de dépôt : 1 décembre 2026",
      "<appel>", "Critères de sélection : Priorité à l'emploi des femmes.", "<rubrique_a_ecrire>", "Longueur maximale : 1500 caractères, espaces comprises",
      "<texte_actuel>\n(vide)", "## Public visé\n40 personnes, dont 28 femmes.", "## Présentation de l'association — Présentation courte",
      "<chiffres_de_l_erp>", "46 personnes accompagnées", "Précision de l'équipe : Insister sur l'emploi.",
    ]) {
      expect(user, piece).toContain(piece);
    }
    // Une autre rubrique vide n'est pas envoyée.
    expect(user).not.toContain("## Partenaires");
  });

  it("sans appel, sans textes, sans chiffres, sans limite : les blocs disparaissent", () => {
    const { user } = draftSectionPrompt({
      ...base, call: null, blocks: [], figures: null, instruction: null, otherSections: [],
      section: { ...base.section, maxChars: null, content: "Notes de l'équipe." },
    });
    expect(user).not.toContain("<appel>");
    expect(user).not.toContain("<textes_de_l_association>");
    expect(user).not.toContain("<chiffres_de_l_erp>");
    expect(user).not.toContain("<autres_rubriques_du_dossier>");
    expect(user).not.toContain("Précision de l'équipe");
    expect(user).toContain("Longueur maximale : non précisée");
    expect(user).toContain("<texte_actuel>\nNotes de l'équipe.");
  });

  it("chaque demande a sa consigne ; « Plus court » vise la limite quand elle existe", () => {
    for (const m of AI_MODES) expect(modeInstruction(m, null).length).toBeGreaterThan(30);
    expect(modeInstruction("raccourcir", 800)).toContain("longueur maximale");
    expect(modeInstruction("raccourcir", null)).toContain("un tiers");
    expect(modeInstruction("concret", null)).toContain("N'invente rien");
  });

  it("la proposition est nettoyée du Markdown et des lignes vides en trop", () => {
    expect(cleanDraftText("## Titre\r\n\r\n\r\n\r\nUn **mot** fort.\n- puce\n")).toBe("Titre\n\nUn mot fort.\n- puce");
  });

  it("la longueur est vérifiée par l'ERP, au caractère près", () => {
    expect(draftRemarks("abcdef", 5, ["  À vérifier.  ", ""])).toEqual([
      "Ce texte fait 6 caractères : il dépasse la limite de 5. Utilisez « Plus court ».",
      "À vérifier.",
    ]);
    expect(draftRemarks("abc", 5, [])).toEqual([]);
    expect(draftRemarks("abc", null, ["1", "2", "3", "4", "5"])).toHaveLength(4);
  });

  it("le schéma de réponse attend un texte et des remarques", () => {
    expect(DraftSchema.safeParse({ text: "x", remarks: [] }).success).toBe(true);
    expect(DraftSchema.safeParse({ text: "x" }).success).toBe(false);
  });
});

describe("IA — plafond mensuel", () => {
  it("plafond par défaut, modifiable dans les réglages de l'organisation", () => {
    expect(resolveAiCap(null)).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(resolveAiCap({})).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(resolveAiCap({ financements: { ai_monthly_cap_usd: 12 } })).toBe(12);
    expect(resolveAiCap({ financements: { ai_monthly_cap_usd: "50" } })).toBe(50);
    expect(resolveAiCap({ financements: { ai_monthly_cap_usd: 0 } })).toBe(0);
    expect(resolveAiCap({ financements: { ai_monthly_cap_usd: -1 } })).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(resolveAiCap({ financements: { ai_monthly_cap_usd: "abc" } })).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
  });

  it("le mois commence le 1er, à l'heure de Paris", () => {
    expect(monthStartDay(new Date("2026-11-18T10:00:00Z"))).toBe("2026-11-01");
    // 30 novembre, 23h30 UTC = 1er décembre, 0h30 à Paris.
    expect(monthStartDay(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
  });
});

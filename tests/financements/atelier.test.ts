import { describe, expect, it } from "vitest";
import {
  AI_MODES, AI_MODE_LABELS, BLOCK_CATEGORIES, BLOCK_CATEGORY_LABELS, MAX_SECTION_CHARS, SECTION_TEMPLATES, TEMPLATE_KEYS, appendText,
  applicationProgress, assembleText, blockRowFromForm, cleanContent, countChars, defaultTemplateForPortal, isTemplateKey, modeNeedsText,
  reorder, sectionRowFromForm, sectionState,
} from "@/lib/financements/atelier";
import { PORTALS } from "@/lib/financements/constants";

describe("Atelier — modèles de rubriques", () => {
  it("chaque modèle a un libellé, et des rubriques titrées avec leur consigne", () => {
    for (const key of TEMPLATE_KEYS) {
      const t = SECTION_TEMPLATES[key];
      expect(t.key).toBe(key);
      expect(t.label.length).toBeGreaterThan(3);
      const titles = t.sections.map((s) => s.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const s of t.sections) {
        expect(s.title.trim().length).toBeGreaterThan(2);
        expect(s.guidance.trim().length).toBeGreaterThan(10);
      }
    }
    expect(SECTION_TEMPLATES.libre.sections).toEqual([]);
    expect(SECTION_TEMPLATES.dauphin_pdv.sections.map((s) => s.title)).toContain("Critères de réussite");
  });

  it("aucun modèle ne fixe de limite de caractères (elle vient du formulaire réel)", () => {
    for (const key of TEMPLATE_KEYS) for (const s of SECTION_TEMPLATES[key].sections) expect(Object.keys(s).sort()).toEqual(["guidance", "title"]);
  });

  it("le modèle proposé suit le portail du dossier", () => {
    expect(defaultTemplateForPortal("dauphin")).toBe("dauphin_pdv");
    expect(defaultTemplateForPortal("compte_asso")).toBe("cerfa_12156");
    expect(defaultTemplateForPortal("mesdemarches_idf")).toBe("region");
    expect(defaultTemplateForPortal("plateforme_fondation")).toBe("fondation");
    expect(defaultTemplateForPortal("courriel")).toBeNull();
    expect(defaultTemplateForPortal(null)).toBeNull();
    for (const p of PORTALS) {
      const k = defaultTemplateForPortal(p);
      if (k) expect(isTemplateKey(k)).toBe(true);
    }
    expect(isTemplateKey("inconnu")).toBe(false);
  });
});

describe("Atelier — longueur et avancement", () => {
  it("compte les caractères espaces comprises, un retour à la ligne pour un", () => {
    expect(countChars("")).toBe(0);
    expect(countChars(null)).toBe(0);
    expect(countChars("Bonjour à tous")).toBe(14);
    expect(countChars("a\nb")).toBe(3);
    expect(countChars("a\r\nb")).toBe(3);
  });

  it("état d'une rubrique : vide, bonne, trop longue", () => {
    expect(sectionState("   \n ", 100)).toBe("vide");
    expect(sectionState("abc", null)).toBe("ok");
    expect(sectionState("abcde", 5)).toBe("ok");
    expect(sectionState("abcdef", 5)).toBe("trop_long");
  });

  it("avancement du dossier", () => {
    expect(
      applicationProgress([
        { title: "A", content: "texte", max_chars: null },
        { title: "B", content: "", max_chars: 10 },
        { title: "C", content: "beaucoup trop long", max_chars: 5 },
      ]),
    ).toEqual({ total: 3, filled: 2, tooLong: 1 });
    expect(applicationProgress([])).toEqual({ total: 0, filled: 0, tooLong: 0 });
  });

  it("ajoute un texte à la suite, séparé par une ligne vide", () => {
    expect(appendText("", "Bloc")).toBe("Bloc");
    expect(appendText("Début.\n\n", "  Bloc  ")).toBe("Début.\n\nBloc");
    expect(appendText("Début.", "   ")).toBe("Début.");
  });

  it("assemble le dossier en texte simple, rubriques vides signalées", () => {
    const text = assembleText(" Mon dossier ", [
      { title: "Objectifs", content: "Apprendre le français.", max_chars: null },
      { title: "Public", content: " ", max_chars: null },
    ]);
    expect(text).toBe("Mon dossier\n\nObjectifs\nApprendre le français.\n\nPublic\n(à rédiger)");
  });

  it("déplace une rubrique d'un cran, sans sortir de la liste", () => {
    expect(reorder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(reorder(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(reorder(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
    expect(reorder(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
    expect(reorder(["a", "b"], "x", "up")).toEqual(["a", "b"]);
  });
});

describe("Atelier — formulaires", () => {
  it("rubrique : titre obligatoire, limite entière positive ou vide", () => {
    expect(sectionRowFromForm({ title: " Objectifs ", guidance: " ", max_chars: "1 500" })).toEqual({ title: "Objectifs", guidance: null, max_chars: 1500 });
    expect(sectionRowFromForm({ title: "X", guidance: "Consigne", max_chars: "" })).toEqual({ title: "X", guidance: "Consigne", max_chars: null });
    expect(sectionRowFromForm({ title: "X", max_chars: 800 }).max_chars).toBe(800);
    expect(() => sectionRowFromForm({ title: "  " })).toThrow("obligatoire");
    expect(() => sectionRowFromForm({ title: "X", max_chars: "abc" })).toThrow("Limite invalide");
    expect(() => sectionRowFromForm({ title: "X", max_chars: "-5" })).toThrow("Limite invalide");
    expect(() => sectionRowFromForm({ title: "X", max_chars: "12.5" })).toThrow("Limite invalide");
  });

  it("texte d'une rubrique : normalisé, borné", () => {
    expect(cleanContent("a\r\nb")).toBe("a\nb");
    expect(() => cleanContent(42)).toThrow("Texte attendu");
    expect(() => cleanContent("x".repeat(MAX_SECTION_CHARS + 1))).toThrow("trop long");
  });

  it("texte de bibliothèque : titre, rangement et texte obligatoires", () => {
    expect(blockRowFromForm({ title: " Présentation ", category: "presentation", content: " Texte\r\nsuite " })).toEqual({
      title: "Présentation", category: "presentation", content: "Texte\nsuite",
    });
    expect(() => blockRowFromForm({ title: "", category: "presentation", content: "x" })).toThrow("titre");
    expect(() => blockRowFromForm({ title: "T", category: "inconnue", content: "x" })).toThrow();
    expect(() => blockRowFromForm({ title: "T", category: "autre", content: "  " })).toThrow("vide");
  });

  it("libellés complets pour les rangements et les demandes à l'IA", () => {
    for (const c of BLOCK_CATEGORIES) expect(BLOCK_CATEGORY_LABELS[c].length).toBeGreaterThan(2);
    for (const m of AI_MODES) expect(AI_MODE_LABELS[m].length).toBeGreaterThan(2);
    expect(modeNeedsText("rediger")).toBe(false);
    for (const m of AI_MODES.filter((x) => x !== "rediger")) expect(modeNeedsText(m)).toBe(true);
  });
});

// Aiguillage de /test/[token] par purpose : « positionnement » → nouveau lecteur (version
// ToFrance) ; mi-parcours et finale → ancien lecteur et ancienne notation, inchangés.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "font-titre" }),
  DM_Sans: () => ({ variable: "font-texte" }),
}));
const fetchTest = vi.fn();
const ouvrirPositionnement = vi.fn();
vi.mock("@/app/test/[token]/actions", () => ({ fetchTest: (t: string) => fetchTest(t) }));
vi.mock("@/app/test/[token]/positionnement-actions", () => ({
  ouvrirPositionnement: (t: string) => ouvrirPositionnement(t),
  repondrePositionnement: vi.fn(),
  terminerPositionnement: vi.fn(),
}));
vi.mock("@/components/placement/test-player", () => ({ TestPlayer: () => "ANCIEN LECTEUR" }));

const { default: TestPage } = await import("@/app/test/[token]/page");
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

async function page(token: string, lang?: string) {
  const el = (await TestPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve(lang ? { lang } : {}) })) as ReactElement;
  return decode(renderToStaticMarkup(el));
}

const ETAPE = { statut: "en_cours", prenom: "Amina", items: [{ id: 101, type: "big_choice", level: "Alpha", competence: "LITTERATIE", question: "Quand vous étiez enfant, êtes-vous allé à l'école ?", options: ["🏫❌ Non, jamais"] }], bloc: "litteratie-declaratif", progression: 0, commence: false };

beforeEach(() => {
  fetchTest.mockReset();
  ouvrirPositionnement.mockReset();
});

describe("aiguillage par purpose", () => {
  it("positionnement en attente → nouveau lecteur (pas l'ancien)", async () => {
    fetchTest.mockResolvedValue({ learnerFirstName: "Amina", status: "en_attente", level: null, purpose: "positionnement", questions: [] });
    ouvrirPositionnement.mockResolvedValue(ETAPE);
    const out = await page("tok");
    expect(out).toContain("Commencer le test");
    expect(out).toContain("environ 30 minutes");
    expect(out).not.toContain("ANCIEN LECTEUR");
    expect(ouvrirPositionnement).toHaveBeenCalledWith("tok");
  });

  it("?lang=ar : consignes et textes en arabe ; langue inconnue → français", async () => {
    fetchTest.mockResolvedValue({ learnerFirstName: "Amina", status: "en_attente", level: null, purpose: "positionnement", questions: [] });
    ouvrirPositionnement.mockResolvedValue(ETAPE);
    expect(await page("tok", "ar")).toContain('dir="rtl" lang="ar"');
    expect(await page("tok", "xx")).not.toContain('lang="xx"');
  });

  it("mi-parcours et finale → ancien lecteur, sans passer par le nouveau service", async () => {
    for (const purpose of ["mi_parcours", "finale"]) {
      fetchTest.mockResolvedValue({ learnerFirstName: "Amina", status: "en_attente", level: null, purpose, questions: [{ id: 1 }] });
      expect(await page("tok")).toContain("ANCIEN LECTEUR");
    }
    expect(ouvrirPositionnement).not.toHaveBeenCalled();
  });

  it("« Test déjà passé » : sans niveau pour le positionnement, inchangé (avec niveau) pour une évaluation", async () => {
    fetchTest.mockResolvedValue({ learnerFirstName: "Amina", status: "fait", level: "A2", purpose: "positionnement", questions: [] });
    const pos = await page("tok");
    expect(pos).toContain("Test déjà passé ✓");
    expect(pos).not.toContain("A2");
    fetchTest.mockResolvedValue({ learnerFirstName: "Amina", status: "fait", level: "B1", purpose: "finale", questions: [] });
    expect(await page("tok")).toContain("(niveau B1)");
  });

  it("lien inconnu → « Lien invalide »", async () => {
    fetchTest.mockResolvedValue(null);
    expect(await page("tok")).toContain("Lien invalide");
  });
});

describe("ancienne notation réservée aux évaluations", () => {
  it("submitTest refuse un test de positionnement (page restée ouverte avant la mise à jour)", async () => {
    vi.resetModules();
    vi.doUnmock("@/app/test/[token]/actions");
    const ecritures: string[] = [];
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "t1", org_id: "o1", learner_id: "l1", status: "en_attente", level: null, purpose: "positionnement", target_level: null, group_id: null, learners: { first_name: "Amina" } } }),
            }),
          }),
          update: () => { ecritures.push(table); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
          insert: async () => { ecritures.push(table); return { error: null }; },
        }),
      }),
    }));
    const { submitTest } = await import("@/app/test/[token]/actions");
    const r = await submitTest({ token: "22222222-2222-4222-8222-222222222222", durationSeconds: 10, answers: { "1": "x" } });
    expect(r).toEqual({ ok: false, error: "Le test a changé : rechargez la page." });
    expect(ecritures).toEqual([]);
  });
});

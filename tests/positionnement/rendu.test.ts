// Rendu du nouveau lecteur (HTML serveur, sans navigateur) : accueil, questions orales au micro
// avec repli écrit, items à relier, consignes traduites (RTL), écran de fin SANS niveau.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "font-titre" }),
  DM_Sans: () => ({ variable: "font-texte" }),
}));
// Les actions serveur ne sont pas appelées au rendu.
vi.mock("@/app/test/[token]/positionnement-actions", () => ({
  repondrePositionnement: vi.fn(),
  terminerPositionnement: vi.fn(),
  ouvrirPositionnement: vi.fn(),
}));

const { FinTest } = await import("@/components/positionnement/fin");
const { QuestionPositionnement } = await import("@/components/positionnement/question");
const { PassationPositionnement } = await import("@/components/positionnement/passation");
const { consigneAffichee } = await import("@/lib/positionnement/consigne");
const { CONSIGNES } = await import("@/lib/positionnement/client");
const { item } = await import("@/lib/positionnement/module/index.ts");
const { itemPourNavigateur } = await import("@/lib/positionnement/items-publics");
const { SIGNUP_CONTACT } = await import("@/lib/inscription/i18n");

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const html = (el: ReturnType<typeof createElement>) => decode(renderToStaticMarkup(el));
const question = (id: number, langue = "fr") =>
  html(createElement(QuestionPositionnement, { item: itemPourNavigateur(item(id)!), prenom: "Amina", langue, valeur: "", onChange: () => {} }));

describe("écran de fin (décision d'Anis : aucun niveau)", () => {
  it("« Merci ! Votre test est enregistré. Nous vous contactons dès que possible. » + contact de l'association", () => {
    const out = html(createElement(FinTest, { langue: "fr" }));
    expect(out).toContain("Merci !");
    expect(out).toContain("Votre test est enregistré.");
    expect(out).toContain("Nous vous contactons dès que possible.");
    expect(out).toContain(SIGNUP_CONTACT.phone);
    expect(out).toContain(`https://wa.me/${SIGNUP_CONTACT.whatsapp}`);
    expect(out).not.toMatch(/\b(A1|A2|B1|B2|niveau)\b/i);
  });

  it("en arabe : traduction littéraire sous le français, de droite à gauche", () => {
    const out = html(createElement(FinTest, { langue: "ar" }));
    expect(out).toContain("Votre test est enregistré.");
    expect(out).toContain('dir="rtl" lang="ar"');
    expect(out).toContain("تم تسجيل اختبارك.");
  });

  it("« Test déjà passé » : sans niveau non plus", () => {
    const out = html(createElement(FinTest, { langue: "fr", prenom: "Amina", deja: true }));
    expect(out).toContain("Test déjà passé ✓");
    expect(out).toContain("Merci Amina !");
    expect(out).not.toMatch(/\b(A1|A2|B1|B2)\b/);
  });
});

describe("questions", () => {
  it("tâche orale : micro du téléphone (« Touchez 🎤 et parlez… ») et lien pour écrire", () => {
    const out = question(55);
    expect(out).toContain('data-testid="bouton-micro"');
    expect(out).toContain("Touchez 🎤 et parlez. Le téléphone écrit ce que vous dites.");
    expect(out).toContain("Je préfère écrire");
    expect(out).not.toContain("<textarea");
  });

  it("production écrite : zone de texte", () => {
    expect(question(53)).toContain("<textarea");
  });

  it("à relier : la colonne B arrive à part, sans paire toute faite", () => {
    const out = question(21);
    for (const d of (item(21)!.pairs as { right: string }[]).map((p) => p.right)) expect(out).toContain(`<option value="${d}">`);
  });

  it("consigne dans la langue de la personne, de droite à gauche en arabe, pachto, dari", () => {
    for (const l of ["ar", "ps", "fa"]) expect(question(1, l)).toContain(`dir="rtl" lang="${l}"`);
    expect(question(1, "en")).toContain('dir="ltr" lang="en"');
    expect(consigneAffichee({ type: "oral", competence: "PO" }, "ar")).toBe(CONSIGNES.parler.ar);
    expect(consigneAffichee({ type: "oral", competence: "PO" }, "ar", true)).toBe(CONSIGNES.ecrire.ar);
    expect(consigneAffichee({ type: "oral", competence: "PO" }, "fr", true)).toBeNull();
    expect(consigneAffichee({ type: "listen_choose", competence: "CO" }, "uk")).toBe(CONSIGNES.ecouter.uk);
  });
});

describe("accueil", () => {
  const etape = (commence: boolean) => ({ statut: "en_cours" as const, prenom: "Amina", items: [itemPourNavigateur(item(101)!)], bloc: "litteratie-declaratif", progression: 0, commence });

  it("test neuf : environ 30 minutes, micro annoncé, case de l'ancien test, « Commencer le test »", () => {
    const out = html(createElement(PassationPositionnement, { token: "t", etapeInitiale: etape(false), langue: "fr" }));
    expect(out).toContain("Bonjour Amina 👋");
    expect(out).toContain("environ 30 minutes");
    expect(out).toContain("vous parlez au téléphone");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("Commencer le test");
  });

  it("reprise : « Continuer le test », sans redemander la case", () => {
    const out = html(createElement(PassationPositionnement, { token: "t", etapeInitiale: etape(true), langue: "en" }));
    expect(out).toContain("Continuer le test");
    expect(out).toContain("Continue the test");
    expect(out).not.toContain('type="checkbox"');
  });
});

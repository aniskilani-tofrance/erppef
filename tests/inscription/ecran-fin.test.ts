import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Les polices Google sont chargées par Next à la compilation : simples variables CSS ici.
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "font-titre" }),
  DM_Sans: () => ({ variable: "font-texte" }),
}));

const { SignupDone } = await import("@/components/inscription/signup-done");
const { SIGNUP_CONTACT, SIGNUP_TEXTS } = await import("@/lib/inscription/i18n");

const TEST = "https://pef-erp.vercel.app/test/abc-123";
// Rendu HTML, entités décodées (« n'est » sort en &#x27;) pour comparer aux textes.
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const html = (props: Parameters<typeof SignupDone>[0]) => decode(renderToStaticMarkup(createElement(SignupDone, props)));

describe("écran de fin — test de niveau", () => {
  it("propose le test tout de suite, avant l'avertissement « place pas assurée »", () => {
    const out = html({ locale: "fr", testUrl: TEST });
    expect(out).toContain(`href="${TEST}"`);
    expect(out).toContain(SIGNUP_TEXTS.fr.testCta);
    expect(out.indexOf(SIGNUP_TEXTS.fr.testCta)).toBeLessThan(out.indexOf(SIGNUP_TEXTS.fr.doneNotice));
  });

  it("« plus tard » : message WhatsApp prérempli vers l'association, avec le lien du test", () => {
    const out = html({ locale: "fr", testUrl: TEST });
    const m = out.match(/href="(https:\/\/wa\.me\/[^"?]+\?text=[^"]+)"/);
    expect(m).not.toBeNull();
    const url = new URL(m![1]);
    expect(url.pathname).toBe(`/${SIGNUP_CONTACT.whatsapp}`);
    expect(url.searchParams.get("text")).toContain(TEST);
    expect(out).toContain(SIGNUP_TEXTS.fr.testKeep);
  });

  it("dans l'iframe du site, le test s'ouvre en plein écran (_top)", () => {
    expect(html({ locale: "fr", testUrl: TEST, embed: true })).toContain(`href="${TEST}" target="_top"`);
    expect(html({ locale: "fr", testUrl: TEST })).not.toContain('target="_top"');
  });

  it("niveau déjà connu (pas de lien) : pas de carte test", () => {
    const out = html({ locale: "fr", testUrl: null });
    expect(out).not.toContain(SIGNUP_TEXTS.fr.testCta);
    expect(out).toContain(SIGNUP_TEXTS.fr.doneNotice);
  });

  it("textes du test présents dans les trois langues, avec la place du lien", () => {
    for (const l of ["fr", "en", "ar"] as const) {
      for (const k of ["testTitle", "testText", "testCta", "testLater", "testKeep"] as const) expect(SIGNUP_TEXTS[l][k].trim()).not.toBe("");
      expect(SIGNUP_TEXTS[l].testKeepMessage).toContain("{lien}");
    }
  });
});

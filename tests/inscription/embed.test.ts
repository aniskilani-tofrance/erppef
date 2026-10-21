import { describe, expect, it } from "vitest";
import { SIGNUP_FRAME_ANCESTORS, SIGNUP_FRAME_CSP, isEmbedParam, postToHost, siteEmbedSnippet } from "@/lib/inscription/embed";
import { provenanceFromSignupSource } from "@/lib/admission/sources";

describe("inscription intégrée dans le site (iframe)", () => {
  it("reconnaît ?embed=1, true ou oui, et rien d'autre", () => {
    expect(isEmbedParam("1")).toBe(true);
    expect(isEmbedParam(" TRUE ")).toBe(true);
    expect(isEmbedParam("oui")).toBe(true);
    expect(isEmbedParam("0")).toBe(false);
    expect(isEmbedParam("")).toBe(false);
    expect(isEmbedParam(null)).toBe(false);
  });

  it("n'autorise que l'ERP, le site et Lovable à afficher le formulaire", () => {
    expect(SIGNUP_FRAME_CSP.startsWith("frame-ancestors 'self' ")).toBe(true);
    expect(SIGNUP_FRAME_ANCESTORS).toContain("https://parleremploiformation.pro");
    expect(SIGNUP_FRAME_ANCESTORS).toContain("https://*.lovable.app");
    expect(SIGNUP_FRAME_ANCESTORS).toContain("https://lovable.dev");
    // Jamais de joker seul ni de http:// en clair.
    expect(SIGNUP_FRAME_ANCESTORS).not.toContain("*");
    for (const a of SIGNUP_FRAME_ANCESTORS) expect(a === "'self'" || a.startsWith("https://")).toBe(true);
  });

  it("donne un code à coller qui vérifie l'origine et encode la provenance", () => {
    const code = siteEmbedSnippet("https://pef-erp.vercel.app/", "Site — Association");
    expect(code).toContain('src="https://pef-erp.vercel.app/inscription?embed=1&src=Site%20%E2%80%94%20Association"');
    expect(code).toContain('e.origin !== "https://pef-erp.vercel.app"');
    expect(code).toContain("pef-inscription:height");
    expect(code).toContain("pef-inscription:step");
  });

  it("ne fait rien hors navigateur", () => {
    expect(() => postToHost({ type: "pef-inscription:done" })).not.toThrow();
  });

  it("range une inscription venue du site en « Formulaire en ligne », précision gardée", () => {
    expect(provenanceFromSignupSource("Site internet")).toEqual({
      contact_source: "formulaire_whatsapp",
      contact_source_detail: "Site internet",
    });
  });
});

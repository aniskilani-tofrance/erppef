import { describe, expect, it } from "vitest";
import { buildTestUrl } from "@/lib/inscription/link";
import { SIGNUP_TEXTS } from "@/lib/inscription/i18n";

// Lien du test proposé à la fin du formulaire : consignes dans la langue du formulaire.
describe("lien du test de niveau", () => {
  it("français : lien nu ; anglais et arabe : ?lang=", () => {
    expect(buildTestUrl("https://pef-erp.vercel.app", "abc", "fr")).toBe("https://pef-erp.vercel.app/test/abc");
    expect(buildTestUrl("https://pef-erp.vercel.app/", "abc", "en")).toBe("https://pef-erp.vercel.app/test/abc?lang=en");
    expect(buildTestUrl("https://pef-erp.vercel.app", "abc", "ar")).toBe("https://pef-erp.vercel.app/test/abc?lang=ar");
  });

  it("durée annoncée : environ 30 minutes, dans les trois langues", () => {
    for (const l of ["fr", "en", "ar"] as const) expect(SIGNUP_TEXTS[l].testText).toMatch(/30/);
  });
});

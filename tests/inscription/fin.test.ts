import { describe, expect, it } from "vitest";
import { PUBLIC_BOOKING_ENABLED } from "@/lib/inscription/booking";
import { SIGNUP_LOCALES, SIGNUP_TEXTS } from "@/lib/inscription/i18n";

describe("écran de fin du formulaire d'inscription", () => {
  it("ne propose pas de réservation en ligne (RDV posés à la main par l'équipe)", () => {
    expect(PUBLIC_BOOKING_ENABLED).toBe(false);
  });

  it("dit qu'on recontacte la personne et que sa place n'est pas assurée, dans chaque langue", () => {
    expect(SIGNUP_TEXTS.fr.doneText).toBe("Nous vous contactons dès que possible.");
    expect(SIGNUP_TEXTS.fr.doneNotice).toContain("pas encore assurée");
    expect(SIGNUP_TEXTS.en.doneNotice).toContain("not guaranteed");
    for (const l of SIGNUP_LOCALES) {
      expect(SIGNUP_TEXTS[l].doneText.trim()).not.toBe("");
      expect(SIGNUP_TEXTS[l].doneNotice.trim()).not.toBe("");
    }
  });
});

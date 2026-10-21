import { describe, expect, it } from "vitest";
import { carriedEntries } from "@/lib/inscription/carry";
import type { SignupValues } from "@/app/inscription/actions";

const filled: SignupValues = {
  firstName: "Amina",
  lastName: "Diallo",
  phone: "+33 6 12 34 56 78",
  languages: ["arabe", "anglais"],
  french: "un_peu",
  availability: ["matin", "soir"],
  city: "Saint-Ouen",
  consent: true,
};

describe("réponses portées d'un écran à l'autre", () => {
  it("au dernier écran (consentement), envoie toutes les réponses précédentes", () => {
    const sent = carriedEntries(filled, "consent");
    expect(sent).toEqual([
      ["firstName", "Amina"],
      ["lastName", "Diallo"],
      ["phone", "+33 6 12 34 56 78"],
      ["languages", "arabe"],
      ["languages", "anglais"],
      ["french", "un_peu"],
      ["availability", "matin"],
      ["availability", "soir"],
      ["city", "Saint-Ouen"],
    ]);
    // Le consentement est la case visible de cet écran : pas de doublon caché.
    expect(sent.some(([k]) => k === "consent")).toBe(false);
  });

  it("n'envoie pas en double les champs de l'écran affiché", () => {
    expect(carriedEntries(filled, "name").some(([k]) => k === "firstName" || k === "lastName")).toBe(false);
    expect(carriedEntries(filled, "languages").some(([k]) => k === "languages")).toBe(false);
  });

  it("n'invente rien pour les réponses vides", () => {
    const empty: SignupValues = { ...filled, languages: [], french: "", availability: [], consent: false };
    const sent = carriedEntries(empty, "city");
    expect(sent.map(([k]) => k)).toEqual(["firstName", "lastName", "phone"]);
  });
});

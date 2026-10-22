import { describe, expect, it } from "vitest";
import { carriedEntries } from "@/lib/inscription/carry";
import type { SignupValues } from "@/app/inscription/actions";

const filled: SignupValues = {
  firstName: "Amina",
  lastName: "Diallo",
  phone: "+33 6 12 34 56 78",
  french: "un_peu",
  cityChoice: "autre",
  city: "Saint-Denis",
  consent: true,
};

describe("réponses portées d'un écran à l'autre", () => {
  it("au dernier écran (consentement), envoie toutes les réponses précédentes", () => {
    const sent = carriedEntries(filled, "consent");
    expect(sent).toEqual([
      ["firstName", "Amina"],
      ["lastName", "Diallo"],
      ["phone", "+33 6 12 34 56 78"],
      ["french", "un_peu"],
      ["cityChoice", "autre"],
      ["city", "Saint-Denis"],
    ]);
    // Le consentement est la case visible de cet écran : pas de doublon caché.
    expect(sent.some(([k]) => k === "consent")).toBe(false);
  });

  it("n'envoie pas en double les champs de l'écran affiché", () => {
    expect(carriedEntries(filled, "name").some(([k]) => k === "firstName" || k === "lastName")).toBe(false);
    expect(carriedEntries(filled, "city").some(([k]) => k === "cityChoice" || k === "city")).toBe(false);
  });

  it("Saint-Ouen : pas de ville tapée envoyée ; rien d'inventé pour les réponses vides", () => {
    expect(carriedEntries({ ...filled, cityChoice: "saint_ouen" }, "consent").some(([k]) => k === "city")).toBe(false);
    const empty: SignupValues = { ...filled, french: "", cityChoice: "", city: "", consent: false };
    expect(carriedEntries(empty, "phone").map(([k]) => k)).toEqual(["firstName", "lastName"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildSignupNote,
  checkStamp,
  firstLanguageOf,
  issueStamp,
  normalizeSignupPhone,
  parseSignup,
  readSignupForm,
  type SignupInput,
} from "@/lib/inscription/signup";
import { SIGNUP_LOCALES, SIGNUP_TEXTS, toLocale } from "@/lib/inscription/i18n";

const valid: SignupInput = {
  firstName: "  Fatima ",
  lastName: "Benali",
  phone: "+33 6 12 34 56 78",
  languages: ["anglais", "arabe"],
  french: "un_peu",
  availability: ["soir", "matin"],
  city: " Saint-Ouen ",
  consent: "on",
};

describe("inscription rapide — téléphone", () => {
  it("accepte les écritures françaises courantes et les ramène à 06 12 34 56 78", () => {
    for (const raw of ["+33 6 12 34 56 78", "+33 06 12 34 56 78", "06.12.34.56.78", "0612345678", "0033 6 12 34 56 78", "+33612345678"]) {
      expect(normalizeSignupPhone(raw), raw).toEqual({ stored: "06 12 34 56 78", digits: "33612345678" });
    }
  });

  it("accepte un numéro étranger (indicatif modifié)", () => {
    expect(normalizeSignupPhone("+216 98 765 432")).toEqual({ stored: "+21698765432", digits: "21698765432" });
    expect(normalizeSignupPhone("0093 70 123 4567")).toEqual({ stored: "+93701234567", digits: "93701234567" });
  });

  it("refuse le champ laissé à « +33 », vide ou trop court", () => {
    expect(normalizeSignupPhone("+33 ")).toBeNull();
    expect(normalizeSignupPhone("")).toBeNull();
    expect(normalizeSignupPhone("+33 6 12")).toBeNull();
    expect(normalizeSignupPhone(null)).toBeNull();
  });
});

describe("inscription rapide — validation", () => {
  it("nettoie et remet les choix dans l'ordre du référentiel", () => {
    const r = parseSignup(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      firstName: "Fatima",
      lastName: "Benali",
      phone: "06 12 34 56 78",
      phoneDigits: "33612345678",
      languages: ["arabe", "anglais"],
      french: "un_peu",
      availability: ["matin", "soir"],
      city: "Saint-Ouen",
    });
  });

  it("la ville est facultative ; l'e-mail n'existe pas", () => {
    const r = parseSignup({ ...valid, city: "   " });
    expect(r.ok && r.data.city).toBeNull();
  });

  it("renvoie la première erreur, dans l'ordre des écrans", () => {
    expect(parseSignup({ ...valid, lastName: " " })).toEqual({ ok: false, error: "name" });
    expect(parseSignup({ ...valid, phone: "+33" })).toEqual({ ok: false, error: "phone" });
    expect(parseSignup({ ...valid, languages: [] })).toEqual({ ok: false, error: "languages" });
    expect(parseSignup({ ...valid, languages: ["klingon"] })).toEqual({ ok: false, error: "languages" });
    expect(parseSignup({ ...valid, french: "" })).toEqual({ ok: false, error: "french" });
    expect(parseSignup({ ...valid, availability: [] })).toEqual({ ok: false, error: "availability" });
    expect(parseSignup({ ...valid, consent: null })).toEqual({ ok: false, error: "consent" });
  });

  it("lit un FormData (cases multiples)", () => {
    const fd = new FormData();
    fd.set("firstName", "Ali");
    fd.set("lastName", "Haidari");
    fd.set("phone", "07 11 22 33 44");
    fd.append("languages", "dari_pachto");
    fd.append("languages", "autre");
    fd.set("french", "pas_du_tout");
    fd.append("availability", "apres_midi");
    fd.set("consent", "on");
    const r = parseSignup(readSignupForm(fd));
    expect(r.ok && r.data.languages).toEqual(["dari_pachto", "autre"]);
    expect(r.ok && r.data.phone).toBe("07 11 22 33 44");
  });

  it("première langue de la fiche : la première langue choisie, jamais « Autre »", () => {
    expect(firstLanguageOf(["autre", "tamoul"])).toBe("Tamoul");
    expect(firstLanguageOf(["autre"])).toBeNull();
  });
});

describe("inscription rapide — note du journal", () => {
  it("résume les réponses en une ligne", () => {
    const r = parseSignup(valid);
    if (!r.ok) throw new Error("invalide");
    expect(buildSignupNote(r.data, { src: "MDQ Landy" })).toBe(
      "Inscription formulaire — langues : arabe, anglais ; français : un peu ; dispo : matin, soir ; ville : Saint-Ouen ; lien : MDQ Landy",
    );
    expect(buildSignupNote({ ...r.data, city: null, availability: ["apres_midi"] }, { reinscription: true })).toBe(
      "Réinscription via formulaire — langues : arabe, anglais ; français : un peu ; dispo : après-midi",
    );
  });
});

describe("inscription rapide — anti-robot", () => {
  const secret = "secret-de-test";
  const t0 = 1_760_870_000_000;

  it("accepte un envoi signé après le délai minimal", () => {
    expect(checkStamp(issueStamp(t0, secret), t0 + 60_000, secret)).toBe("ok");
  });

  it("refuse un envoi trop rapide", () => {
    expect(checkStamp(issueStamp(t0, secret), t0 + 1500, secret)).toBe("too_fast");
  });

  it("refuse une signature fausse, absente ou forgée", () => {
    const stamp = issueStamp(t0, secret);
    expect(checkStamp(stamp, t0 + 60_000, "autre-secret")).toBe("invalid");
    expect(checkStamp(`${t0 - 3_600_000}.${stamp.split(".")[1]}`, t0 + 60_000, secret)).toBe("invalid");
    expect(checkStamp(null, t0, secret)).toBe("invalid");
    expect(checkStamp("n'importe quoi", t0, secret)).toBe("invalid");
  });
});

describe("inscription rapide — traductions", () => {
  it("les trois langues ont tous les textes, l'arabe s'écrit de droite à gauche", () => {
    const keys = Object.keys(SIGNUP_TEXTS.fr).sort();
    for (const l of SIGNUP_LOCALES) {
      expect(Object.keys(SIGNUP_TEXTS[l]).sort()).toEqual(keys);
      expect(Object.keys(SIGNUP_TEXTS[l].errors).sort()).toEqual(Object.keys(SIGNUP_TEXTS.fr.errors).sort());
      expect(SIGNUP_TEXTS[l].privacy).toHaveLength(SIGNUP_TEXTS.fr.privacy.length);
    }
    expect(toLocale("ar")).toBe("ar");
    expect(toLocale("de")).toBe("fr");
    expect(toLocale(null)).toBe("fr");
  });

  it("le consentement en français est la phrase validée", () => {
    expect(SIGNUP_TEXTS.fr.consent).toBe("ParlerEmploi garde mes infos pour me contacter pour une formation.");
  });
});

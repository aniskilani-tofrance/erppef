import { describe, expect, it } from "vitest";
import {
  buildSignupNote,
  checkStamp,
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
  french: "un_peu",
  cityChoice: "saint_ouen",
  city: "",
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
  it("Saint-Ouen : ville et code postal remplis sur la fiche", () => {
    const r = parseSignup(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      firstName: "Fatima",
      lastName: "Benali",
      phone: "06 12 34 56 78",
      phoneDigits: "33612345678",
      french: "un_peu",
      cityChoice: "saint_ouen",
      city: "Saint-Ouen",
      postalCode: "93400",
    });
  });

  it("autre ville : la ville tapée, facultative, sans code postal", () => {
    const r = parseSignup({ ...valid, cityChoice: "autre", city: " Aubervilliers " });
    expect(r.ok && [r.data.city, r.data.postalCode]).toEqual(["Aubervilliers", null]);
    const vide = parseSignup({ ...valid, cityChoice: "autre", city: "  " });
    expect(vide.ok && [vide.data.city, vide.data.postalCode]).toEqual([null, null]);
  });

  it("renvoie la première erreur, dans l'ordre des écrans", () => {
    expect(parseSignup({ ...valid, lastName: " " })).toEqual({ ok: false, error: "name" });
    expect(parseSignup({ ...valid, phone: "+33" })).toEqual({ ok: false, error: "phone" });
    expect(parseSignup({ ...valid, french: "" })).toEqual({ ok: false, error: "french" });
    expect(parseSignup({ ...valid, cityChoice: "" })).toEqual({ ok: false, error: "city" });
    expect(parseSignup({ ...valid, cityChoice: "paris" })).toEqual({ ok: false, error: "city" });
    expect(parseSignup({ ...valid, consent: null })).toEqual({ ok: false, error: "consent" });
  });

  it("lit un FormData", () => {
    const fd = new FormData();
    fd.set("firstName", "Ali");
    fd.set("lastName", "Haidari");
    fd.set("phone", "07 11 22 33 44");
    fd.set("french", "pas_du_tout");
    fd.set("cityChoice", "autre");
    fd.set("city", "Saint-Denis");
    fd.set("consent", "on");
    const r = parseSignup(readSignupForm(fd));
    expect(r.ok && r.data.phone).toBe("07 11 22 33 44");
    expect(r.ok && r.data.city).toBe("Saint-Denis");
  });
});

describe("inscription rapide — note du journal", () => {
  it("résume les réponses en une ligne", () => {
    const r = parseSignup(valid);
    if (!r.ok) throw new Error("invalide");
    expect(buildSignupNote(r.data, { src: "MDQ Landy" })).toBe(
      "Inscription formulaire — français : un peu ; ville : Saint-Ouen (93400) ; lien : MDQ Landy",
    );
    expect(buildSignupNote({ french: "bien", cityChoice: "autre", city: "Saint-Denis" }, { reinscription: true })).toBe(
      "Réinscription via formulaire — français : bien ; ville : autre — Saint-Denis",
    );
    expect(buildSignupNote({ french: "pas_du_tout", cityChoice: "autre", city: null })).toBe(
      "Inscription formulaire — français : pas du tout ; ville : autre (non précisée)",
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

import { describe, expect, it } from "vitest";
import { buildSignupMessage, buildSignupUrl, sanitizeSrc, whatsappShareUrl } from "@/lib/inscription/link";
import { DEFAULT_TEMPLATES } from "@/lib/admission/templates";
import { provenanceFromSignupSource } from "@/lib/admission/sources";
import { resolveProvenance } from "@/lib/admission/sources";

describe("lien d'inscription rapide", () => {
  it("ajoute la provenance encodée, ou rien", () => {
    expect(buildSignupUrl("https://pef-erp.vercel.app")).toBe("https://pef-erp.vercel.app/inscription");
    expect(buildSignupUrl("https://pef-erp.vercel.app/", "  ")).toBe("https://pef-erp.vercel.app/inscription");
    expect(buildSignupUrl("https://pef-erp.vercel.app", "MDQ Landy & Co")).toBe("https://pef-erp.vercel.app/inscription?src=MDQ%20Landy%20%26%20Co");
  });

  it("nettoie la provenance (balises, contrôles, longueur)", () => {
    expect(sanitizeSrc("  <b>MDQ\n Landy</b> ")).toBe("b MDQ Landy /b");
    expect(sanitizeSrc("x".repeat(200))).toHaveLength(80);
    expect(sanitizeSrc(null)).toBeNull();
  });

  it("le message par défaut porte le lien, en français facile + anglais + arabe", () => {
    const link = "https://pef-erp.vercel.app/inscription?src=MDQ";
    const msg = buildSignupMessage(DEFAULT_TEMPLATES.lien_inscription, link);
    expect(msg.startsWith("Bonjour 👋\nPour vous inscrire aux cours de français ParlerEmploi, cliquez ici :\n" + link + "\n📱 C'est rapide (2 minutes).")).toBe(true);
    expect(msg).toContain("English:");
    expect(msg).toContain("العربية:");
    expect(msg).not.toContain("{");
  });

  it("partage WhatsApp sans destinataire", () => {
    expect(whatsappShareUrl("Bonjour 👋 a&b")).toBe(`https://wa.me/?text=${encodeURIComponent("Bonjour 👋 a&b")}`);
  });
});

describe("provenance d'une inscription par formulaire", () => {
  it("sans provenance : canal « Formulaire en ligne », famille Contact direct", () => {
    const p = provenanceFromSignupSource(null);
    expect(p).toEqual({ contact_source: "formulaire_whatsapp", contact_source_detail: null });
    expect(resolveProvenance(p)).toMatchObject({ family: "direct", label: "Formulaire en ligne" });
  });

  it("« MDQ Landy » reste une maison de quartier (BOP104)", () => {
    const p = provenanceFromSignupSource("MDQ Landy");
    expect(p).toEqual({ contact_source: "maison_de_quartier", contact_source_detail: "Landy (formulaire en ligne)" });
    expect(resolveProvenance(p).family).toBe("quartier");
  });

  it("un prescripteur reconnu garde sa famille ; un texte libre devient la précision", () => {
    expect(resolveProvenance(provenanceFromSignupSource("CCAS Saint-Ouen")).family).toBe("prescripteur");
    expect(provenanceFromSignupSource("France Travail").contact_source).toBe("france_travail");
    expect(provenanceFromSignupSource("Affiche boulangerie")).toEqual({ contact_source: "formulaire_whatsapp", contact_source_detail: "Affiche boulangerie" });
  });
});

import { describe, expect, it } from "vitest";
import { groupBroadcastText, isWhatsAppGroupLink, normalizeWhatsAppGroupLink, whatsappGroupRoster, type RosterMember } from "@/lib/groupes/whatsapp-group";

describe("lien d'invitation WhatsApp", () => {
  it("accepte un lien chat.whatsapp.com, avec ou sans https, et le nettoie", () => {
    expect(normalizeWhatsAppGroupLink("https://chat.whatsapp.com/AbCdEfGh123456")).toBe("https://chat.whatsapp.com/AbCdEfGh123456");
    expect(normalizeWhatsAppGroupLink("chat.whatsapp.com/AbCdEfGh123456/ ")).toBe("https://chat.whatsapp.com/AbCdEfGh123456");
    expect(normalizeWhatsAppGroupLink("http://www.chat.whatsapp.com/AbCdEfGh123456?x=1")).toBe("https://chat.whatsapp.com/AbCdEfGh123456");
  });
  it("refuse tout autre lien (numéro, site, texte)", () => {
    expect(normalizeWhatsAppGroupLink("https://wa.me/33612345678")).toBeNull();
    expect(normalizeWhatsAppGroupLink("https://parleremploi.fr")).toBeNull();
    expect(normalizeWhatsAppGroupLink("groupe de la classe")).toBeNull();
    expect(normalizeWhatsAppGroupLink("")).toBeNull();
    expect(isWhatsAppGroupLink(null)).toBe(false);
  });
});

describe("qui ajouter / retirer du groupe", () => {
  const m = (name: string, status: RosterMember["status"], consent: boolean | null): RosterMember => ({ learnerId: name, name, phone: null, status, consent });
  it("classe les inscrits par consentement et signale les partis à retirer", () => {
    const r = whatsappGroupRoster([
      m("Zoé", "inscrit", true), m("Ali", "inscrit", true), m("Bao", "inscrit", false), m("Cem", "inscrit", null),
      m("Dina", "abandon", true), m("Eli", "termine", true), m("Fay", "abandon", null), m("Gus", "abandon", false),
    ]);
    expect(r.toAdd.map((x) => x.name)).toEqual(["Ali", "Zoé"]);
    expect(r.toRemove.map((x) => x.name)).toEqual(["Dina", "Eli"]);
    expect(r.refused.map((x) => x.name)).toEqual(["Bao"]);
    expect(r.notAsked.map((x) => x.name)).toEqual(["Cem"]);
  });
});

describe("texte pour le groupe d'annonces", () => {
  it("met le français puis chaque langue une seule fois", () => {
    const out = groupBroadcastText("Bonjour à tous.\n", [
      { language: "arabe", text: "مرحبا" }, { language: "Arabe", text: "doublon" }, { language: "turc", text: "  " }, { language: "dari", text: "سلام" },
    ]);
    expect(out).toBe("Bonjour à tous.\n\nمرحبا\n\nسلام");
  });
});

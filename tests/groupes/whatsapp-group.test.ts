import { describe, expect, it } from "vitest";
import {
  buildGroupInviteSms,
  groupBroadcastText,
  groupInviteNote,
  isWhatsAppGroupLink,
  normalizeWhatsAppGroupLink,
  pickGroupInviteQueue,
  whatsappGroupRoster,
  type RosterMember,
} from "@/lib/groupes/whatsapp-group";
import { baseVars, buildStageMessage } from "@/lib/admission/templates";

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

describe("« Inviter tout le groupe » : à qui envoyer le lien", () => {
  const m = (name: string, consent: boolean | null, phone: string | null = "06 12 34 56 78", status: RosterMember["status"] = "inscrit") =>
    ({ learnerId: name, name, firstName: name, phone, status, consent });
  const note = (id: string, at: string, text: string) => ({ learner_id: id, contacted_at: at, note: text });

  it("tous les inscrits sauf les refus, par ordre alphabétique ; jamais les partis", () => {
    const r = pickGroupInviteQueue([m("Zoé", null), m("Ali", true), m("Bao", false), m("Dina", null, "06 00 00 00 01", "abandon")], [], "PEF A1");
    expect(r.targets.map((t) => t.name)).toEqual(["Ali", "Zoé"]);
    expect(r.refused).toBe(1);
    expect(r.targets.find((t) => t.name === "Ali")?.consent).toBe(true);
  });

  it("signale l'invitation déjà envoyée pour CE groupe (la plus récente), pas pour un autre groupe", () => {
    const r = pickGroupInviteQueue([m("Ali", null), m("Cem", null)], [
      note("Ali", "2026-11-02T08:00:00Z", groupInviteNote("PEF A1", "whatsapp")),
      note("Ali", "2026-11-03T08:00:00Z", groupInviteNote("PEF A1", "sms")),
      note("Cem", "2026-11-02T08:00:00Z", groupInviteNote("Atelier conversation", "whatsapp")),
      note("Cem", "2026-11-02T09:00:00Z", "Lien d'inscription à la réunion envoyé (WhatsApp)"),
    ], "PEF A1");
    expect(r.targets.find((t) => t.name === "Ali")?.alreadySentAt).toBe("2026-11-03T08:00:00Z");
    expect(r.targets.find((t) => t.name === "Cem")?.alreadySentAt).toBeNull();
  });

  it("numéro inutilisable : dans la liste mais signalé (pas d'envoi possible)", () => {
    const r = pickGroupInviteQueue([m("Ali", null, null), m("Bao", null, "12")], [], "G");
    expect(r.targets.every((t) => !t.phoneOk)).toBe(true);
  });

  it("note du journal et SMS court avec le lien, sans emoji", () => {
    expect(groupInviteNote("PEF A1 — 2026-27", "sms")).toBe("Invitation au groupe WhatsApp de la classe envoyée (SMS) — PEF A1 — 2026-27");
    const sms = buildGroupInviteSms("PEF A1 — 2026-27", "https://chat.whatsapp.com/AbCdEfGh123456");
    expect(sms).toContain("https://chat.whatsapp.com/AbCdEfGh123456");
    expect(sms).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(sms.length).toBeLessThan(200);
  });

  it("message WhatsApp : prénom, groupe, lien du groupe, et comment refuser", () => {
    const msg = buildStageMessage("invitation_groupe_whatsapp", { ...baseVars("Fatima", "Marie"), groupe: "PEF A1 — 2026-27", lien_whatsapp: "https://chat.whatsapp.com/AbCdEfGh123456" });
    expect(msg.startsWith("Bonjour Fatima,")).toBe(true);
    expect(msg).toContain("(PEF A1 — 2026-27)");
    expect(msg).toContain("https://chat.whatsapp.com/AbCdEfGh123456");
    expect(msg).toContain("Répondez NON");
    expect(msg.trimEnd().endsWith("Marie")).toBe(true);
  });
});

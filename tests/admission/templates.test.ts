import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  MESSAGE_STAGES,
  messageForSituation,
  pickStage,
  renderTemplate,
  resolveTemplates,
} from "@/lib/admission/templates";

const names = { learnerFirstName: "Fatima", senderFirstName: "Marie" };

describe("modèles de messages par étape", () => {
  it("chaque étape a un texte différent, sans virgule parasite ni variable inconnue", () => {
    const texts = MESSAGE_STAGES.map((s) => s.text);
    expect(new Set(texts).size).toBe(texts.length);
    const known = new Set(["prenom", "expediteur", "signature", "organisme", "lien", "date", "lieu", "groupe", "date_debut", "niveau"]);
    for (const s of MESSAGE_STAGES) {
      for (const m of s.text.matchAll(/\{([a-z_]+)\}/g)) expect(known.has(m[1]), `${s.code} : {${m[1]}}`).toBe(true);
      for (const v of s.variables) expect(s.text, `${s.code} annonce {${v}}`).toContain(`{${v}}`);
    }
  });

  it("remplit les variables et supprime les lignes purement décoratives vides", () => {
    const out = renderTemplate("Bonjour {prenom},\n📅 {date}\n📍 {lieu}\n\nMerci,\n{signature}", {
      prenom: "Ali", date: "lundi 5 octobre à 14h00", lieu: null, signature: "Marie",
    });
    expect(out).toBe("Bonjour Ali,\n📅 lundi 5 octobre à 14h00\n\nMerci,\nMarie");
  });

  it("sans prénom, « Bonjour , » devient « Bonjour, » et l'expéditeur anonyme reste correct", () => {
    const { message } = messageForSituation({ admissionStatus: "nouveau" }, { learnerFirstName: null, senderFirstName: null });
    expect(message.startsWith("Bonjour,")).toBe(true);
    expect(message).toContain("Je vous écris de la part de Parler Emploi Formation.");
    expect(message).not.toMatch(/ {2}/);
    expect(message).not.toMatch(/ \n/);
    expect(message.trimEnd().endsWith("L'équipe Parler Emploi Formation")).toBe(true);
  });

  it("choisit l'étape selon le statut ET la situation", () => {
    expect(pickStage({ admissionStatus: "nouveau" })).toBe("premier_contact");
    expect(pickStage({ admissionStatus: null })).toBe("premier_contact");
    expect(pickStage({ admissionStatus: "injoignable" })).toBe("relance");
    expect(pickStage({ admissionStatus: "contacte", pendingTestUrl: "https://x/test/t" })).toBe("test_positionnement");
    expect(pickStage({ admissionStatus: "contacte" })).toBe("suite_contact");
    expect(pickStage({ admissionStatus: "convoque", upcomingMeeting: { date: "demain", place: null } })).toBe("convocation");
    expect(pickStage({ admissionStatus: "convoque" })).toBe("suite_contact");
    expect(pickStage({ admissionStatus: "evalue" })).toBe("apres_reunion");
    expect(pickStage({ admissionStatus: "inscrit", enrollment: { group: "A1", startsOn: "1er octobre", place: null } })).toBe("inscription");
    expect(pickStage({ admissionStatus: "sans_suite" })).toBe("porte_ouverte");
  });

  it("« à contacter » et « à convoquer » ne reçoivent jamais le même texte", () => {
    const a = messageForSituation({ admissionStatus: "nouveau" }, names).message;
    const b = messageForSituation({ admissionStatus: "contacte" }, names).message;
    const c = messageForSituation({ admissionStatus: "convoque", upcomingMeeting: { date: "mardi 6 octobre 2026 à 14h00", place: "Salle 12" } }, names).message;
    const d = messageForSituation({ admissionStatus: "evalue" }, names).message;
    const e = messageForSituation({ admissionStatus: "inscrit", enrollment: { group: "PEF A1 — Groupe 1", startsOn: "jeudi 1er octobre 2026", place: "Salle 12" } }, names).message;
    expect(new Set([a, b, c, d, e]).size).toBe(5);
    expect(a).toContain("Vous avez demandé des cours de français");
    expect(b).toContain("La prochaine étape est une réunion d'information");
    expect(c).toContain("📅 mardi 6 octobre 2026 à 14h00");
    expect(c).toContain("📍 Salle 12");
    expect(d).toContain("nous vous proposons une place");
    expect(e).toContain("inscrit(e) au groupe PEF A1 — Groupe 1");
    expect(e).toContain("Premier cours : jeudi 1er octobre 2026");
  });

  it("le lien du test est sur sa propre ligne, tel quel", () => {
    const { stage, message } = messageForSituation(
      { admissionStatus: "contacte", pendingTestUrl: "https://pef-erp.vercel.app/test/abc" }, names,
    );
    expect(stage).toBe("test_positionnement");
    expect(message.split("\n")).toContain("https://pef-erp.vercel.app/test/abc");
  });

  it("les retouches de l'organisme priment sur les défauts, les vides sont ignorés", () => {
    const t = resolveTemplates({ whatsapp_templates: { relance: "Coucou {prenom} !", convocation: "   " } });
    expect(t.relance).toBe("Coucou {prenom} !");
    expect(t.convocation).toBe(DEFAULT_TEMPLATES.convocation);
    expect(messageForSituation({ admissionStatus: "injoignable" }, names, t).message).toBe("Coucou Fatima !");
  });
});

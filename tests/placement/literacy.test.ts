import { describe, expect, it } from "vitest";
import {
  gradeTest,
  literacyGateDecision,
  routeLiteracy,
} from "@/lib/placement/grading";
import { nameDistractors } from "@/lib/placement/literacy-questions";

// Réponses correctes du bloc littératie (id → réponse).
const GOOD: Record<number, string> = {
  101: "🏫 Oui, un peu",
  103: "📞", 104: "☕", 105: "🐱",       // oral 3/3
  106: "MAISON", 107: "A", 108: "AMINA", // L0 3/3 (prénom AMINA)
  109: "35",                             // chiffres
  110: "PAIN", 111: "BUS",               // L1 2/2
  112: "🚕", 113: "🍎",                  // L2 2/2
  114: "17",
};

function answersWith(overrides: Record<number, string | undefined>): Record<number, string> {
  const merged: Record<number, string> = { ...GOOD };
  for (const [id, v] of Object.entries(overrides)) {
    if (v === undefined) delete merged[Number(id)];
    else merged[Number(id)] = v;
  }
  return merged;
}

describe("routeLiteracy — croisement oral/écrit (jamais un score unique)", () => {
  it("Pré-alpha : pas d'entrée dans l'écrit ET oral non fonctionnel", () => {
    const a = answersWith({ 103: "🍌", 104: "🥖", 105: "🚪", 106: "🌺", 107: "M", 108: "AMIRA" });
    expect(routeLiteracy(a, "Amina")).toBe("Pré-alpha");
  });

  it("Alpha : écrit non acquis MAIS oral fonctionnel (le cas normal, pas l'exception)", () => {
    const a = answersWith({ 106: "🌺", 107: "7", 108: "AMIRA" });
    expect(routeLiteracy(a, "Amina")).toBe("Alpha");
  });

  it("Illettrisme probable : scolarisé longtemps EN FRANÇAIS mais écrit échoué → orientation ANLCI, pas alpha", () => {
    const a = answersWith({
      101: "🏫🎓 Oui, longtemps", 102: "🇫🇷 Oui",
      106: "🌺", 107: "7", 108: "AMIRA",
    });
    expect(routeLiteracy(a, "Amina")).toBe("Illettrisme probable (orienter ANLCI)");
  });

  it("scolarisé dans un AUTRE alphabet + écrit échoué → Alpha (transfert FLE), pas illettrisme", () => {
    const a = answersWith({
      101: "🏫🎓 Oui, longtemps", 102: "🌍 Non",
      106: "🌺", 107: "7", 108: "AMIRA",
    });
    expect(routeLiteracy(a, "Amina")).toBe("Alpha");
  });

  it("Alpha (palier exploration) : entré dans l'écrit mais déchiffrage nul", () => {
    const a = answersWith({ 110: "VÉLO", 111: "RIZ" });
    expect(routeLiteracy(a, "Amina")).toBe("Alpha");
  });

  it("Post-alpha (A1.1 en cours) : déchiffre mais l'accès au sens n'est pas stabilisé", () => {
    const a = answersWith({ 112: "🍎", 113: "🚌" }); // L2 = 0..1
    expect(routeLiteracy(a, "Amina")).toBe("Post-alpha (A1.1 en cours)");
  });

  it("sortie haute : L2 = 2/2 → null (le test CECRL prend le relais)", () => {
    expect(routeLiteracy(GOOD, "Amina")).toBeNull();
  });

  it("le prénom est comparé sans casse ni accents parasites", () => {
    const a = answersWith({ 108: "amina" });
    expect(routeLiteracy(a, "AMINA")).toBeNull(); // toujours sortie haute
  });
});

describe("literacyGateDecision — arrêts anticipés", () => {
  it("arrêt écrit n°1 : L0 < 2/3 → on saute le déchiffrage", () => {
    const a = answersWith({ 106: "🌺", 107: "7" });
    expect(literacyGateDecision(a, "L0", "Amina")).toEqual({ continue: false });
  });

  it("L0 ≥ 2/3 → on continue", () => {
    expect(literacyGateDecision(GOOD, "L0", "Amina")).toEqual({ continue: true });
  });

  it("arrêt écrit n°2 : déchiffrage nul → on saute la lecture-compréhension", () => {
    const a = answersWith({ 110: "PIED", 111: "BAS" });
    expect(literacyGateDecision(a, "L1", "Amina")).toEqual({ continue: false });
  });

  it("sortie haute uniquement si L2 = 2/2", () => {
    expect(literacyGateDecision(GOOD, "L2", "Amina")).toEqual({ continue: true });
    expect(literacyGateDecision(answersWith({ 113: "🚌" }), "L2", "Amina")).toEqual({ continue: false });
  });
});

describe("gradeTest — intégration bloc littératie", () => {
  it("profil Alpha : niveau issu du routage, score = % des items notés administrés", async () => {
    // Arrêt écrit n°1 : items 110+ non administrés (absents des réponses)
    const a = answersWith({ 106: "🌺", 107: "7", 108: "AMIRA", 110: undefined, 111: undefined, 112: undefined, 113: undefined, 114: undefined });
    const r = await gradeTest(a, { firstName: "Amina" });
    expect(r.level).toBe("Alpha");
    // notés administrés : oral 3/3 + L0 0/3 + chiffres 1/1 = 4/7
    expect(r.score).toBe(57);
  });

  it("RGPD : le prénom et ses distracteurs ne sont jamais stockés dans le détail", async () => {
    const r = await gradeTest(GOOD, { firstName: "Amina" });
    const item108 = r.answers.find((x) => x.questionId === 108);
    expect(item108?.answer).toBe("(prénom reconnu)");
    expect(JSON.stringify(r.answers)).not.toContain("AMINA");
  });

  it("le déclaratif (scolarisation) n'entre jamais dans le score", async () => {
    const r = await gradeTest(GOOD, { firstName: "Amina" });
    const item101 = r.answers.find((x) => x.questionId === 101);
    expect(item101?.correct).toBe(false); // enregistré mais jamais « correct »
  });

  it("un test CECRL sans bloc littératie (anciens liens) garde le barème historique", async () => {
    const r = await gradeTest({ 1: "Lundi" });
    expect(["A1", "A2", "B1", "B2"]).toContain(r.level);
  });
});

describe("nameDistractors — item prénom", () => {
  it("génère 3 distracteurs distincts, jamais le prénom lui-même", () => {
    for (const name of ["Amina", "Li", "Jean-Baptiste", "Fatoumata"]) {
      const d = nameDistractors(name);
      expect(d).toHaveLength(3);
      expect(new Set(d).size).toBe(3);
      expect(d).not.toContain(name.toUpperCase());
    }
  });
});

// Correspondance des niveaux du test (ToFrance) vers les niveaux de l'ERP, score sur 100 et
// synthèse affichée à l'équipe sur la fiche.
import { describe, expect, it } from "vitest";
import { LEVELS } from "@/lib/referentiels";
import { construireRapport, deroulerParcours } from "@/lib/positionnement/module/index.ts";
import { A_EVALUER_ACCOMPAGNANT, CORRESPONDANCE_NIVEAUX, niveauErp, scoreSur100 } from "@/lib/positionnement/niveaux";
import { libelleNiveauTest, resumeCompetences, synthesePositionnement } from "@/lib/positionnement/synthese";
import { passer } from "./simulation";

// Toutes les valeurs que le module peut donner au niveau global (types.ts : NiveauResultat et
// ResultatLitteratie["palier"]).
const GLOBAUX = [
  "A1", "A2", "B1", "B2", "infra_A1", "non_evalue",
  "Pré-alpha", "Alpha", "Alpha avancé", "Post-alpha (A1.1 en cours)", "Illettrisme probable", "A1.1 acquis",
];

describe("correspondance des niveaux", () => {
  it("chaque résultat possible du test a un niveau ERP (LEVELS) ou « À évaluer avec un accompagnant »", () => {
    for (const g of GLOBAUX) {
      const n = niveauErp({ niveau: g });
      expect([...LEVELS, A_EVALUER_ACCOMPAGNANT], g).toContain(n);
    }
    expect(Object.keys(CORRESPONDANCE_NIVEAUX).sort()).toEqual([...GLOBAUX].sort());
  });

  it("table retenue : CECRL tel quel, paliers tels quels, sinon le plus prudent", () => {
    expect(niveauErp({ niveau: "B2" })).toBe("B2");
    expect(niveauErp({ niveau: "A1" })).toBe("A1");
    expect(niveauErp({ niveau: "infra_A1" })).toBe("A1.1");
    expect(niveauErp({ niveau: "A1.1 acquis" })).toBe("A1.1");
    expect(niveauErp({ niveau: "Post-alpha (A1.1 en cours)" })).toBe("Post-alpha (A1.1 en cours)");
    expect(niveauErp({ niveau: "Pré-alpha" })).toBe("Pré-alpha");
    expect(niveauErp({ niveau: "Illettrisme probable" })).toBe("Alpha");
    expect(niveauErp({ niveau: "non_evalue" })).toBe(A_EVALUER_ACCOMPAGNANT);
  });

  it("rien d'exploitable (valeur inconnue, absente) → « À évaluer avec un accompagnant »", () => {
    expect(niveauErp({ niveau: "C1" })).toBe(A_EVALUER_ACCOMPAGNANT);
    expect(niveauErp(null)).toBe(A_EVALUER_ACCOMPAGNANT);
    expect(niveauErp(undefined)).toBe(A_EVALUER_ACCOMPAGNANT);
  });

  it("règle « fragile » (moins de 3 compétences) : le plus bas des niveaux connus, même table", () => {
    // Le module donne déjà le plus bas : l'ERP ne remonte jamais un niveau fragile.
    expect(niveauErp({ niveau: "A1" })).toBe("A1");
  });
});

describe("score sur 100", () => {
  it("part pondérée des questions réussies parmi celles posées", () => {
    expect(scoreSur100([{ correct: true, poids: 1 }, { correct: false, poids: 1 }, { correct: true, poids: 0.5 }], { regle: "3_sur_4" })).toBe(60);
    expect(scoreSur100([{ correct: true, poids: 1 }], { regle: "3_sur_4" })).toBe(100);
  });
  it("null quand il n'a pas de sens : palier « lire et écrire », abandon, rien de corrigé", () => {
    expect(scoreSur100([{ correct: true, poids: 1 }], { regle: "litteratie" })).toBeNull();
    expect(scoreSur100([{ correct: true, poids: 1 }], { regle: "3_sur_4", abandon: true })).toBeNull();
    expect(scoreSur100([], { regle: "3_sur_4" })).toBeNull();
    expect(scoreSur100([{ correct: false, poids: 1 }], { regle: "aucune" })).toBeNull();
  });
});

describe("synthèse pour la fiche", () => {
  it("niveau par compétence, profil, mention à confirmer, depuis answers.rapport", async () => {
    const { bilan } = await passer({ niveaux: { CO: 3, PO: 3, CE: 1, PE: 1, LANGUE: 1 }, scolarisation: "un_peu" });
    const s = synthesePositionnement({ rapport: bilan.rapport })!;
    expect(s).not.toBeNull();
    expect(s.competences.map((c) => c.code)).toEqual(["CO", "CE", "PO", "PE", "LANGUE"]);
    expect(s.competences.find((c) => c.code === "CO")!.niveau).toBe("B1");
    expect(s.competences.find((c) => c.code === "CE")!.niveau).toBe("A1");
    expect(s.competences.find((c) => c.code === "PO")!.correction).toBe("corrigé par IA");
    expect(s.profil).toBe("Oral plus avancé que l'écrit");
    expect(s.global).toBe("A1");
    expect(s.aConfirmer).toBe(true);
    expect(resumeCompetences(s)).toBe("CO B1 · CE A1 · PO B1 · PE A1");
  });

  it("palier « Illettrisme probable » repéré ; abandon sans mention à confirmer", () => {
    const rapportAbandon = construireRapport({ trace: deroulerParcours({}, () => undefined).trace, evaluations: {}, reponses: {}, dureeSecondes: 10, interfaceAbandon: true });
    const s = synthesePositionnement({ rapport: rapportAbandon, interface_abandon: true })!;
    expect(s.abandon).toBe(true);
    expect(s.aConfirmer).toBe(false);
    const illettrisme = { ...rapportAbandon, litteratie: { ...rapportAbandon.litteratie, palier: "Illettrisme probable" } };
    expect(synthesePositionnement({ rapport: illettrisme })!.illettrisme).toBe(true);
  });

  it("anciens tests (tableau de réponses corrigées) ou vide : pas de synthèse, affichage inchangé", () => {
    expect(synthesePositionnement([{ questionId: 1, answer: "x", correct: true }])).toBeNull();
    expect(synthesePositionnement(null)).toBeNull();
    expect(synthesePositionnement({ rapport: null, interface_abandon: null })).toBeNull();
    expect(synthesePositionnement({ rapport: [] })).toBeNull();
  });

  it("libellés lisibles", () => {
    expect(libelleNiveauTest("infra_A1")).toBe("A1 non atteint");
    expect(libelleNiveauTest("non_evalue")).toBe("Non évalué");
    expect(libelleNiveauTest(undefined)).toBe("—");
  });
});

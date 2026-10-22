// Module partagé du test de positionnement (repris des tests ToFrance du 15/10/2026,
// src/lib/__tests__/positionnement.test.ts) : banque, correction, parcours adaptatif, profil
// par compétence, règle du niveau global, repli sans IA. Le module est une COPIE identique
// (empreinte) : ces tests vérifient qu'il marche aussi dans l'ERP. Le parcours adaptatif évolue
// côté ToFrance : on ne vérifie ici que des RÉSULTATS (niveaux, profil), jamais le nombre
// d'items par niveau, l'ordre des questions ou la durée exacte.
import { describe, expect, it } from "vitest";
import {
  BANQUE, ITEMS_NOUVEAUX, couverture, corrigerItemFerme, champJuste, itemsPublics, evaluerLibre, niveauGlobal,
  profilType, dureeParcours, faitsDuRapport, construireRapport, deroulerParcours, item, MENTION,
  type Item, type NiveauResultat,
} from "@/lib/positionnement/module/index.ts";
import { bonneReponse, iaFactice, mauvaiseReponse, passer } from "./simulation";

const NIV = ["A1", "A2", "B1", "B2"] as const;
const LIBRES = ["written", "oral", "reformulate"];

describe("banque", () => {
  it("couvre les 4 compétences : au moins 3 items par niveau A1→B1 et 2 en B2", () => {
    const t = couverture();
    for (const c of ["CO", "CE", "PO", "PE"]) {
      for (const n of ["A1", "A2", "B1"] as const) expect(t[c][n], `${c} ${n}`).toBeGreaterThanOrEqual(3);
      expect(t[c].B2, `${c} B2`).toBeGreaterThanOrEqual(2);
    }
  });

  it("identifiants uniques, compétence et niveau renseignés", () => {
    const ids = BANQUE.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BANQUE.filter((q) => q.competence === "LITTERATIE")).toHaveLength(14);
    for (const q of BANQUE) expect(q.question, `item ${q.id}`).toBeTruthy();
  });

  it("les items ajoutés sont marqués « à relire » et signés", () => {
    expect(ITEMS_NOUVEAUX.length).toBeGreaterThanOrEqual(24);
    for (const q of ITEMS_NOUVEAUX) {
      expect(q.relecture, `item ${q.id}`).toBe("a_relire");
      expect(q.auteur).toBe("claude");
    }
  });

  it("QCM : une seule bonne réponse, présente dans les options, sans doublon", () => {
    for (const q of BANQUE.filter((x) => Array.isArray(x.options) && x.options.length && x.correct !== undefined)) {
      const bonne = typeof q.correct === "number" ? q.options![q.correct] : q.correct;
      expect(q.options!.filter((o) => o === bonne), `item ${q.id}`).toHaveLength(1);
      expect(new Set(q.options).size, `item ${q.id}`).toBe(q.options!.length);
    }
  });

  it("productions orales : durée maximale indiquée ; productions libres : critères", () => {
    for (const q of BANQUE.filter((x) => x.type === "oral")) expect(q.dureeMax, `item ${q.id}`).toBeGreaterThan(0);
    for (const q of BANQUE.filter((x) => LIBRES.includes(x.type))) expect(q.criteria?.length, `item ${q.id}`).toBeGreaterThan(0);
  });
});

describe("correction des items fermés", () => {
  const fermes = BANQUE.filter((q) => q.competence !== "LITTERATIE" && !LIBRES.includes(q.type));
  it.each(fermes.map((q) => [q.id, q] as [number, Item]))("item %i : juste avec la bonne réponse, faux sinon", (_id, q) => {
    expect(corrigerItemFerme(q, bonneReponse(q))).toBe(true);
    expect(corrigerItemFerme(q, mauvaiseReponse(q))).toBe(false);
    expect(corrigerItemFerme(q, "")).toBe(false);
  });

  it("formulaire : le contenu compte, plus seulement le nombre de cases remplies", () => {
    const q = item(45)!;
    const rempliAuHasard = JSON.stringify({ name: "x", reason: "x", start: "x", end: "x", manager: "x" });
    expect(corrigerItemFerme(q, rempliAuHasard)).toBe(false);
    expect(champJuste("20 juin 2026", "le 20 juin")).toBe(true);
    expect(champJuste("Pierre Martin", "M. Martin")).toBe(true);
  });

  it("version publique : aucune bonne réponse ne part au navigateur", () => {
    const pub = JSON.stringify(itemsPublics(BANQUE));
    for (const cle of ['"correct"', '"acceptedAnswers"', '"correctBlanks"', '"correctSentence"', '"correctOrder"', '"justification"', '"explanation"', '"criteria"', '"answer"', '"category":"Formel"']) {
      expect(pub.includes(cle), cle).toBe(false);
    }
  });
});

describe("grille des productions libres", () => {
  it("IA : note critère par critère, marquée à confirmer", async () => {
    const e = await evaluerLibre(item(224)!, "BON je suis malade", iaFactice);
    expect(e.mode).toBe("ia");
    expect(e.reussi).toBe(true);
    expect(e.a_confirmer).toBe(true);
    expect(e.criteres.map((c) => c.critere)).toEqual(["realisation", "lexique", "morphosyntaxe", "aisance"]);
  });

  it("repli sans IA si Mistral est en panne ou répond n'importe quoi", async () => {
    const panne = async () => { throw new Error("503"); };
    const e1 = await evaluerLibre(item(53)!, "Bonjour Monsieur, je serai absent demain parce que je suis malade et je dois aller chez le médecin. Je vous envoie le certificat dès que possible. Cordialement, Amina", panne);
    expect(e1.mode).toBe("repli");
    expect(e1.a_confirmer).toBe(true);
    expect(e1.total).toBeLessThanOrEqual(5);
    const e2 = await evaluerLibre(item(53)!, "court", async () => "pas du JSON");
    expect(e2.mode).toBe("repli");
    expect(e2.reussi).toBe(false);
    const e3 = await evaluerLibre(item(53)!, "Bonjour", null);
    expect(e3.mode).toBe("repli");
  });

  it("une réponse vide n'est jamais réussie", async () => {
    expect((await evaluerLibre(item(55)!, "  ", iaFactice)).reussi).toBe(false);
  });
});

describe("règle du niveau global (3 compétences sur 4)", () => {
  const g = (co: NiveauResultat, ce: NiveauResultat, po: NiveauResultat, pe: NiveauResultat) =>
    niveauGlobal({ CO: co, CE: ce, PO: po, PE: pe });
  it("prend le 3e niveau le plus haut", () => {
    expect(g("B1", "B1", "B1", "B1")).toBe("B1");
    expect(g("B2", "B1", "B1", "A2")).toBe("B1");
    expect(g("B1", "A2", "B1", "A1")).toBe("A2");
    expect(g("B1", "A1", "B1", "A1")).toBe("A1");
    expect(g("A2", "infra_A1", "A2", "infra_A1")).toBe("infra_A1");
  });
  it("3 compétences évaluées : le plus bas des trois ; moins de 3 : pas de global", () => {
    expect(g("B1", "A2", "non_evalue", "B1")).toBe("A2");
    expect(g("B1", "non_evalue", "non_evalue", "B1")).toBeNull();
  });
  it("profil oral > écrit mis en avant", () => {
    expect(profilType({ CO: "B1", PO: "B1", CE: "A1", PE: "A1" })).toBe("oral_superieur_ecrit");
    expect(profilType({ CO: "A1", PO: "A1", CE: "A2", PE: "B1" })).toBe("ecrit_superieur_oral");
    expect(profilType({ CO: "A2", PO: "A2", CE: "A2", PE: "B1" })).toBe("homogene");
  });
});

describe("parcours adaptatif et profil par compétence", () => {
  for (const [nom, r] of [["A1", 1], ["A2", 2], ["B1", 3], ["B2", 4]] as const) {
    it(`personne homogène ${nom} : chaque compétence et le global à ${nom}, sans passer toute la banque`, async () => {
      const { bilan, administres } = await passer({ niveaux: { CO: r, CE: r, PO: r, PE: r, LANGUE: r }, scolarisation: r >= 2 ? "longtemps" : "un_peu" });
      const rp = bilan.rapport;
      for (const c of ["CO", "CE", "PO", "PE"] as const) expect(rp.competences[c].niveau, c).toBe(nom);
      expect(rp.global.niveau).toBe(nom);
      expect(rp.global.regle).toBe("3_sur_4");
      expect(rp.profil.type).toBe("homogene");
      expect(dureeParcours(administres)).toBeGreaterThan(0);
      expect(administres.length).toBeLessThan(BANQUE.length);
    });
  }

  it("profil oral > écrit : global au niveau de 3 compétences, profil signalé, recommandation d'ateliers d'écrit", async () => {
    const { bilan } = await passer({ niveaux: { CO: 3, PO: 3, CE: 1, PE: 1, LANGUE: 1 }, scolarisation: "un_peu" });
    const rp = bilan.rapport;
    expect(rp.competences.CO.niveau).toBe("B1");
    expect(rp.competences.CE.niveau).toBe("A1");
    expect(rp.competences.PO.niveau).toBe("B1");
    expect(rp.competences.PE.niveau).toBe("A1");
    expect(rp.global.niveau).toBe("A1");
    expect(rp.profil.type).toBe("oral_superieur_ecrit");
    expect(rp.recommandations.join(" ")).toMatch(/Ateliers d'écrit/);
  });

  it("chaque compétence a son indice de confiance, ses « je peux » ; l'IA est à confirmer", async () => {
    const { bilan } = await passer({ niveaux: { CO: 2, CE: 2, PO: 2, PE: 2, LANGUE: 2 } });
    const rp = bilan.rapport;
    for (const c of ["CO", "CE", "PO", "PE"] as const) {
      expect(["faible", "moyenne", "bonne"]).toContain(rp.competences[c].confiance);
      expect(rp.competences[c].jePeux.length).toBeGreaterThan(0);
      expect(rp.competences[c].itemsPasses).toBeGreaterThan(0);
    }
    expect(rp.competences.PO.a_confirmer).toBe(true);
    expect(rp.competences.PO.mode).toBe("ia");
    expect(rp.competences.CO.a_confirmer).toBe(false);
    expect(rp.a_confirmer).toBe(true);
    expect(rp.mention).toBe(MENTION);
    expect(rp.mention).toMatch(/pas une certification \(DELF, DALF, TCF\)/);
  });

  it("repli sans IA de bout en bout : le test se termine, production en confiance faible", async () => {
    const { bilan } = await passer({ niveaux: { CO: 2, CE: 2, PO: 2, PE: 2, LANGUE: 2 } }, async () => { throw new Error("Mistral en panne"); });
    expect(bilan.rapport.competences.PO.mode).toBe("repli");
    expect(bilan.rapport.competences.PO.confiance).toBe("faible");
    expect(bilan.rapport.competences.CO.niveau).toBe("A2");
    expect(bilan.rapport.global.niveau).not.toBe("non_evalue");
  });

  it("personne qui ne lit pas : arrêt au bloc littératie, oral évalué, global = palier", async () => {
    const { bilan, administres } = await passer({ niveaux: { PO: 1 }, scolarisation: "jamais", lit: false, oral: true });
    const rp = bilan.rapport;
    expect(rp.global.regle).toBe("litteratie");
    expect(rp.global.niveau).toBe("Alpha");
    expect(rp.competences.CE.niveau).toBe("non_evalue");
    expect(rp.competences.PO.niveau).toBe("A1");
    expect(rp.profil.type).toBe("oral_superieur_ecrit");
    // On ne fait pas lire les questions écrites (compréhension écrite) à qui ne lit pas.
    expect(administres.some((id) => item(id)!.competence === "CE")).toBe(false);
    expect(rp.recommandations[0]).toMatch(/Alphabétisation/);
  });

  it("abandon à l'entraînement : aucun niveau, aucun fait écrit", async () => {
    const r = construireRapport({ trace: deroulerParcours({}, () => undefined).trace, evaluations: {}, reponses: {}, dureeSecondes: 30, interfaceAbandon: true });
    expect(r.global.niveau).toBe("non_evalue");
  });
});

describe("faits du dossier (ToFrance, non utilisés par l'ERP)", () => {
  it("source « test », 6 mois, niveau global repris", async () => {
    const { bilan } = await passer({ niveaux: { CO: 3, CE: 2, PO: 3, PE: 2, LANGUE: 2 } });
    const faits = faitsDuRapport(bilan.rapport);
    expect(faits.map((f) => f.cle)).toEqual(expect.arrayContaining([
      "niveau_cecrl_evalue", "niveau_francais_verifie", "niveau_co_evalue", "niveau_ce_evalue", "niveau_po_evalue", "niveau_pe_evalue",
    ]));
    for (const f of faits) {
      expect(f.source).toBe("test");
      expect(f.valide_jours).toBe(180);
    }
    expect(faits.find((f) => f.cle === "niveau_cecrl_evalue")?.valeur).toBe(bilan.rapport.global.niveau);
  });
});

describe("recommandations neutres", () => {
  it("jamais d'organisme nommé, seulement des types de parcours", async () => {
    for (const r of [1, 2, 3, 4]) {
      const { bilan } = await passer({ niveaux: { CO: r, CE: r, PO: r, PE: r, LANGUE: r } });
      for (const reco of bilan.rapport.recommandations) {
        expect(reco).not.toMatch(/ParlerEmploi|Parler Emploi|\bPEF\b|OFII|France Travail|Alliance|GRETA|AFPA|Cléa|ANLCI/i);
      }
    }
  });
});

it("niveaux simulés couvrent toute l'échelle", () => {
  expect(NIV).toHaveLength(4);
});

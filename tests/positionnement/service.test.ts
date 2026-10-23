// Service du test de positionnement (ERP) : état rangé dans placement_tests.answers sans
// migration, reprise après fermeture de la page, clôture (niveau sur la fiche, score), repli
// sans IA (Mistral 429), verrou contre les envois en double. Sans réseau ni base.
import { describe, expect, it } from "vitest";
import { dureeParcours, item, VERSION_PARCOURS, type AppelIA } from "@/lib/positionnement/module/index.ts";
import { lireEtat } from "@/lib/positionnement/etat";
import { ouvrirTest, repondreTest, terminerTest, type Dependances, type EtapeTest } from "@/lib/positionnement/service";
import { depotMemoire, ligneTest, type LigneTest } from "./depot-memoire";
import { iaFactice, repondre, type Personne } from "./simulation";

const TOKEN = "22222222-2222-4222-8222-222222222222";

function monter(ligne: Partial<LigneTest> = {}, appelIA: AppelIA | null = iaFactice) {
  const lignes = [ligneTest(ligne)];
  const apprenants = { "apprenant-1": { org_id: "org-prod", first_name: "Amina Sara", level_assessed: null as string | null } };
  const { depot, ecritures } = depotMemoire(lignes, apprenants);
  const d: Dependances = { depot, appelIA, maintenant: () => new Date("2026-10-23T10:00:00Z") };
  return { d, lignes, apprenants, ecritures };
}

type EnCours = Extract<EtapeTest, { statut: "en_cours" }>;

/** Répond bloc par bloc comme le ferait le navigateur, jusqu'à la fin (ou `maxBlocs`). */
async function passer(d: Dependances, p: Personne, maxBlocs = 80) {
  let e = (await ouvrirTest(d, TOKEN)) as EtapeTest;
  let blocs = 0;
  while (e.statut === "en_cours" && blocs < maxBlocs) {
    const reponses = Object.fromEntries(e.items.map((q) => [String(q.id), repondre(p, item(q.id)!)]));
    const r = await repondreTest(d, TOKEN, reponses, { secondes: 20, langue: "ar" });
    if (!r.ok) throw new Error(r.error);
    e = r.etape;
    blocs += 1;
  }
  return e;
}

describe("ouvrir", () => {
  it("test neuf : premières questions (bloc « lire et écrire »), sans bonne réponse, rien d'écrit", async () => {
    const { d, ecritures } = monter();
    const e = (await ouvrirTest(d, TOKEN)) as EnCours;
    expect(e.statut).toBe("en_cours");
    expect(e.commence).toBe(false);
    expect(e.prenom).toBe("Amina");
    expect(e.items.length).toBeGreaterThan(0);
    expect(e.bloc.startsWith("litteratie")).toBe(true);
    expect(JSON.stringify(e.items)).not.toMatch(/"correct"|"acceptedAnswers"/);
    expect(ecritures).toEqual([]);
  });

  it("lien inconnu, jeton mal formé ou test d'évaluation : rien (l'ancien lecteur s'en occupe)", async () => {
    expect(await ouvrirTest(monter().d, "33333333-3333-4333-8333-333333333333")).toBeNull();
    expect(await ouvrirTest(monter().d, "pas-un-jeton")).toBeNull();
    expect(await ouvrirTest(monter({ purpose: "mi_parcours" }).d, TOKEN)).toBeNull();
    const r = await repondreTest(monter({ purpose: "finale" }).d, TOKEN, { 101: "x" });
    expect(r.ok).toBe(false);
  });

  it("ancien format dans answers (tableau corrigé) : repart d'un test neuf", async () => {
    const { d } = monter({ answers: [{ questionId: 1, answer: "x", correct: false }] });
    const e = (await ouvrirTest(d, TOKEN)) as EnCours;
    expect(e.commence).toBe(false);
    const premier = e.items.map((q) => [String(q.id), repondre({ niveaux: {} }, item(q.id)!)]);
    const r = await repondreTest(d, TOKEN, Object.fromEntries(premier));
    expect(r.ok).toBe(true);
  });
});

describe("répondre et reprendre", () => {
  it("chaque bloc est rangé dans answers (sans migration) ; la reprise donne la suite", async () => {
    const { d, lignes } = monter();
    const e1 = (await ouvrirTest(d, TOKEN)) as EnCours;
    const reponses = Object.fromEntries(e1.items.map((q) => [String(q.id), repondre({ niveaux: { CO: 2 }, scolarisation: "un_peu" }, item(q.id)!)]));
    const r = await repondreTest(d, TOKEN, reponses, { secondes: 40, langue: "ar" });
    expect(r.ok).toBe(true);
    const etat = lireEtat(lignes[0].answers)!;
    expect(etat.modele).toBe("positionnement-tofrance");
    expect(etat.tour).toBe(1);
    expect(etat.langue).toBe("ar");
    expect(etat.duree_secondes).toBe(40);
    expect(Object.keys(etat.reponses).map(Number).sort()).toEqual(e1.items.map((q) => q.id).sort());
    expect(lignes[0].status).toBe("en_attente");
    // Page fermée puis rouverte : même suite, test « commencé ».
    const reprise = (await ouvrirTest(d, TOKEN)) as EnCours;
    expect(reprise.commence).toBe(true);
    expect(reprise.items.map((q) => q.id)).toEqual((r as { etape: EnCours }).etape.items.map((q) => q.id));
  });

  it("seuls les items attendus sont gardés ; un envoi en double ne réécrit rien", async () => {
    const { d, lignes, ecritures } = monter();
    const e1 = (await ouvrirTest(d, TOKEN)) as EnCours;
    const reponses: Record<string, string> = Object.fromEntries(e1.items.map((q) => [String(q.id), "🏫 Oui, un peu"]));
    reponses["229"] = "réponse glissée pour un item non demandé";
    await repondreTest(d, TOKEN, reponses);
    expect(lireEtat(lignes[0].answers)!.reponses[229]).toBeUndefined();
    const avant = ecritures.length;
    const encore = await repondreTest(d, TOKEN, reponses);
    expect(encore.ok).toBe(true);
    expect(ecritures.length).toBe(avant);
  });

  it("verrou : si une autre écriture est passée entre-temps, on renvoie l'état rangé sans l'écraser", async () => {
    const { d, lignes } = monter();
    const e1 = (await ouvrirTest(d, TOKEN)) as EnCours;
    const reponses = Object.fromEntries(e1.items.map((q) => [String(q.id), repondre({ niveaux: {} }, item(q.id)!)]));
    // Deux onglets lisent le même état, le premier écrit d'abord.
    const lecture = await d.depot.testParJeton(TOKEN);
    await repondreTest(d, TOKEN, reponses);
    const tourApres = lireEtat(lignes[0].answers)!.tour;
    const depotFige: Dependances = { ...d, depot: { ...d.depot, testParJeton: async () => lecture } };
    await repondreTest(depotFige, TOKEN, reponses);
    expect(lireEtat(lignes[0].answers)!.tour).toBe(tourApres);
  });
});

describe("nouveau parcours (23/10) : durée, progression, reprise", () => {
  const h = (r: number) => ({ CO: r, CE: r, PO: r, PE: r, LANGUE: r });
  const PROFILS: [string, Personne][] = [
    ["A1", { niveaux: h(1), scolarisation: "un_peu" }],
    ["A2", { niveaux: h(2), scolarisation: "longtemps" }],
    ["B1", { niveaux: h(3), scolarisation: "longtemps" }],
    ["B2", { niveaux: h(4), scolarisation: "longtemps" }],
    ["lit mal, parle B1", { niveaux: { CO: 3, PO: 3, CE: 0, PE: 0, LANGUE: 1 }, scolarisation: "un_peu", lecture: "mots", fautes: [111] }],
    ["B1, bloc « lire et écrire » complet", { niveaux: h(3), scolarisation: "un_peu" }],
  ];

  it.each(PROFILS)("%s : 36 minutes au plus (accord d'Anis), progression qui avance sans dépasser 95 avant la fin", async (_nom, p) => {
    const { d, lignes } = monter();
    let e = (await ouvrirTest(d, TOKEN)) as EtapeTest;
    const progressions: number[] = [];
    while (e.statut === "en_cours") {
      progressions.push(e.progression);
      const r = await repondreTest(d, TOKEN, Object.fromEntries(e.items.map((q) => [String(q.id), repondre(p, item(q.id)!)])), { secondes: 30 });
      if (!r.ok) throw new Error(r.error);
      e = r.etape;
    }
    expect(lignes[0].status).toBe("fait");
    for (let i = 1; i < progressions.length; i++) expect(progressions[i]).toBeGreaterThanOrEqual(progressions[i - 1]);
    expect(Math.max(...progressions)).toBeLessThanOrEqual(95);
    const administres = Object.keys(lireEtat(lignes[0].answers)!.reponses).map(Number);
    expect(dureeParcours(administres)).toBeLessThanOrEqual(36 * 60);
    expect(lireEtat(lignes[0].answers)!.rapport?.versionParcours).toBe(VERSION_PARCOURS);
  });

  it("reprise au milieu du test (page fermée) : même résultat qu'une passation d'une traite", async () => {
    const p: Personne = { niveaux: { CO: 3, PO: 2, CE: 2, PE: 1, LANGUE: 2 }, scolarisation: "un_peu" };
    const traite = monter();
    await passer(traite.d, p);

    const coupe = monter();
    await passer(coupe.d, p, 4); // 4 blocs, puis la personne ferme la page
    expect(coupe.lignes[0].status).toBe("en_attente");
    const reprise = (await ouvrirTest(coupe.d, TOKEN)) as EnCours;
    expect(reprise.commence).toBe(true);
    expect(reprise.items.length).toBeGreaterThan(0);
    await passer(coupe.d, p);
    expect(coupe.lignes[0].status).toBe("fait");
    expect(coupe.lignes[0].level).toBe(traite.lignes[0].level);
    expect(lireEtat(coupe.lignes[0].answers)!.rapport?.global).toEqual(lireEtat(traite.lignes[0].answers)!.rapport?.global);
  });

  it("lecture pas acquise : la fiche reçoit le palier seul, le rapport garde le niveau à l'oral", async () => {
    const { d, lignes, apprenants } = monter();
    await passer(d, { niveaux: { CO: 3, PO: 3, CE: 0, PE: 0, LANGUE: 1 }, scolarisation: "un_peu", lecture: "mots", fautes: [111] });
    expect(lignes[0].level).toBe("Alpha avancé");
    expect(apprenants["apprenant-1"].level_assessed).toBe("Alpha avancé");
    expect(lireEtat(lignes[0].answers)!.rapport?.global).toMatchObject({ regle: "palier_litteratie_oral", niveauOral: "B1" });
    expect(typeof lignes[0].score).toBe("number");
  });
});

describe("terminer", () => {
  it("parcours complet : status fait, niveau global sur la fiche, détail rangé, prénom masqué", async () => {
    const { d, lignes, apprenants } = monter();
    const fin = await passer(d, { niveaux: { CO: 2, CE: 2, PO: 2, PE: 2, LANGUE: 2 }, scolarisation: "longtemps" });
    expect(fin.statut).toBe("fait");
    const l = lignes[0];
    expect(l.status).toBe("fait");
    expect(l.level).toBe("A2");
    expect(apprenants["apprenant-1"].level_assessed).toBe("A2");
    expect(typeof l.score).toBe("number");
    expect(l.score!).toBeGreaterThan(0);
    expect(l.score!).toBeLessThanOrEqual(100);
    expect(l.duration_seconds).toBeGreaterThan(0);
    expect(l.completed_at).toBe("2026-10-23T10:00:00.000Z");
    const etat = lireEtat(l.answers)!;
    expect(etat.rapport?.global.niveau).toBe("A2");
    expect(etat.profil?.type).toBe("homogene");
    expect(etat.niveau_erp).toBe("A2");
    expect(etat.version_banque).toBeTruthy();
    expect(JSON.stringify(etat.reponses)).not.toMatch(/AMINA/);
    // Lien rouvert : « Test déjà passé ».
    expect(await ouvrirTest(d, TOKEN)).toEqual({ statut: "fait", prenom: "Amina" });
  });

  it("Mistral en 429 : le repli sans IA suffit pour finir le test", async () => {
    const quota: AppelIA = async () => { throw new Error("429"); };
    const { d, lignes } = monter({}, quota);
    const fin = await passer(d, { niveaux: { CO: 3, CE: 3, PO: 3, PE: 3, LANGUE: 3 }, scolarisation: "longtemps" });
    expect(fin.statut).toBe("fait");
    const etat = lireEtat(lignes[0].answers)!;
    expect(etat.rapport?.competences.PE.mode).toBe("repli");
    expect(lignes[0].level).not.toBe("À évaluer avec un accompagnant");
  });

  it("personne qui ne lit pas : palier sur la fiche, score null", async () => {
    const { d, lignes, apprenants } = monter();
    await passer(d, { niveaux: { PO: 1 }, scolarisation: "jamais", lit: false, oral: true });
    expect(lignes[0].status).toBe("fait");
    expect(lignes[0].level).toBe("Alpha");
    expect(lignes[0].score).toBeNull();
    expect(apprenants["apprenant-1"].level_assessed).toBe("Alpha");
  });

  it("abandon à l'entraînement : « À évaluer avec un accompagnant », refusé une fois le test commencé", async () => {
    const { d, lignes, apprenants } = monter();
    const r = await terminerTest(d, TOKEN, { interfaceAbandon: true, secondes: 30 });
    expect(r.ok).toBe(true);
    expect(lignes[0].level).toBe("À évaluer avec un accompagnant");
    expect(lignes[0].score).toBeNull();
    expect(apprenants["apprenant-1"].level_assessed).toBe("À évaluer avec un accompagnant");
    expect(lireEtat(lignes[0].answers)!.interface_abandon).toBe(true);

    const autre = monter();
    const e1 = (await ouvrirTest(autre.d, TOKEN)) as EnCours;
    await repondreTest(autre.d, TOKEN, Object.fromEntries(e1.items.map((q) => [String(q.id), "🏫 Oui, un peu"])));
    expect((await terminerTest(autre.d, TOKEN, { interfaceAbandon: true })).ok).toBe(false);
    expect(autre.lignes[0].status).toBe("en_attente");
  });

  it("terminer avant la fin du parcours : refusé, rien n'est clos", async () => {
    const { d, lignes } = monter();
    const r = await terminerTest(d, TOKEN, {});
    expect(r.ok).toBe(false);
    expect(lignes[0].status).toBe("en_attente");
  });

  it("n'écrit que sur la ligne du jeton et la fiche de cet apprenant dans cet organisme", async () => {
    const lignes = [ligneTest(), ligneTest({ id: "autre", token: "44444444-4444-4444-8444-444444444444", org_id: "bac-a-sable", learner_id: "apprenant-1" })];
    const apprenants = { "apprenant-1": { org_id: "org-prod", first_name: "Amina", level_assessed: null as string | null } };
    const { depot } = depotMemoire(lignes, apprenants);
    const d: Dependances = { depot, appelIA: iaFactice };
    await terminerTest(d, TOKEN, { interfaceAbandon: true });
    expect(lignes[1].status).toBe("en_attente");
    expect(lignes[1].answers).toBeNull();
  });
});

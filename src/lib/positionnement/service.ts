// Passation du test de positionnement (version ToFrance) CÔTÉ SERVEUR : ouvrir, répondre,
// terminer. Remplace la fonction edge de ToFrance par des fonctions appelées depuis les actions
// serveur de /test/[token]. La base (Depot) et l'IA (AppelIA) sont injectées : testable sans
// réseau. Le JETON du lien est le secret ; seuls les tests « positionnement » passent ici
// (mi-parcours et finale gardent l'ancien lecteur).
//
// Pas de transcription côté serveur : une réponse orale arrive déjà en TEXTE (reconnaissance
// vocale du navigateur, ou repli à l'écrit) et se note avec la grille orale du module. Aucune
// voix n'est reçue ni gardée. Seul le moteur du module (moteur.ts : avancer, terminer) décide
// des questions : rien ici ne dépend du nombre d'items par niveau ni de l'ordre du parcours.

import {
  avancer, DUREE_CIBLE, dureeParcours, item, itemsPublics, terminer as terminerModule, VERSION_BANQUE,
  type AppelIA, type Reponses,
} from "./module/index.ts";
import {
  DUREE_MAX, etatInitial, langueValide, lireEtat, masquerPrenom, secondesBornees,
  type EtatPositionnement,
} from "./etat";
import { niveauErp, scoreSur100 } from "./niveaux";
import type { EtapeTest, ResultatTest } from "./etape";

export interface TestPositionnement {
  id: string;
  org_id: string;
  learner_id: string;
  status: "en_attente" | "fait";
  purpose: string | null;
  answers: unknown;
  /** Premier prénom de l'apprenant (item 108 « Touchez votre prénom »). */
  prenom: string;
}

/** Verrou d'écriture : l'état lu (son numéro de tour) ou « neuf » (rien de rangé encore). */
export type Verrou = { tour: number } | "neuf";

export interface Cloture {
  answers: EtatPositionnement;
  level: string;
  score: number | null;
  duration_seconds: number;
  completed_at: string;
}

export interface DepotPositionnement {
  testParJeton(token: string): Promise<TestPositionnement | null>;
  /** Range l'état en cours si personne n'a écrit entre-temps. false sinon. */
  enregistrerEtat(t: TestPositionnement, etat: EtatPositionnement, verrou: Verrou): Promise<boolean>;
  /** Clôture : status « fait » + résultat. false si déjà clos ou changé entre-temps. */
  cloturer(t: TestPositionnement, fin: Cloture, verrou: Verrou): Promise<boolean>;
  /** Niveau global converti → learners.level_assessed. */
  majNiveauApprenant(t: TestPositionnement, niveau: string): Promise<void>;
}

export interface Dependances {
  depot: DepotPositionnement;
  appelIA: AppelIA | null;
  maintenant?: () => Date;
}

export type { EtapeTest, ResultatTest };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIEN_INVALIDE = "Lien de test invalide.";

/** Le test du jeton, s'il existe et s'il s'agit bien d'un test de positionnement. */
async function charger(d: Dependances, token: unknown): Promise<TestPositionnement | null> {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  const t = await d.depot.testParJeton(token);
  if (!t || (t.purpose ?? "positionnement") !== "positionnement") return null;
  return t;
}

function verrouDe(t: TestPositionnement): Verrou {
  const e = lireEtat(t.answers);
  return e ? { tour: e.tour } : "neuf";
}

function etapePublique(t: TestPositionnement, rep: Reponses, etape: { items: number[]; bloc: string; trace: { administres: number[] } }): EtapeTest {
  const faits = etape.trace.administres.filter((id) => rep[id] != null);
  return {
    statut: "en_cours",
    prenom: t.prenom,
    // Version publique du module : sans bonne réponse (« à relier » : deux colonnes séparées).
    items: itemsPublics(etape.items.map((id) => item(id)!)),
    bloc: etape.bloc,
    // Estimation : temps des questions déjà répondues / durée cible du module (30 minutes).
    progression: etape.items.length ? Math.min(95, Math.round((dureeParcours(faits) / DUREE_CIBLE) * 100)) : 100,
    commence: Object.keys(rep).length > 0,
  };
}

/**
 * État du test et prochaines questions. Lecture seule. Sans IA : les productions demandées par
 * le parcours sont toujours évaluées au moment où elles sont envoyées (repondreTest), avec la
 * réponse, dans la même écriture.
 */
export async function ouvrirTest(d: Dependances, token: unknown): Promise<EtapeTest | null> {
  const t = await charger(d, token);
  if (!t) return null;
  if (t.status === "fait") return { statut: "fait", prenom: t.prenom };
  const e = lireEtat(t.answers);
  const rep = e?.reponses ?? {};
  const { etape } = await avancer(rep, e?.evaluations ?? {}, null, t.prenom || undefined);
  return etapePublique(t, rep, etape);
}

async function rouvrir(d: Dependances, token: unknown): Promise<ResultatTest> {
  const etape = await ouvrirTest(d, token);
  return etape ? { ok: true, etape } : { ok: false, error: LIEN_INVALIDE };
}

/**
 * Range les réponses du bloc en cours (seulement les items que le parcours attend) et renvoie
 * la suite. Le parcours fini, le test se clôt dans le même appel (niveau rangé sur la fiche).
 */
export async function repondreTest(
  d: Dependances,
  token: unknown,
  reponses: unknown,
  opts: { secondes?: unknown; langue?: unknown } = {},
): Promise<ResultatTest> {
  const t = await charger(d, token);
  if (!t) return { ok: false, error: LIEN_INVALIDE };
  if (t.status === "fait") return { ok: true, etape: { statut: "fait", prenom: t.prenom } };
  if (!reponses || typeof reponses !== "object" || Array.isArray(reponses)) return { ok: false, error: "Réponses invalides." };

  const maintenant = (d.maintenant ?? (() => new Date()))();
  const verrou = verrouDe(t);
  const etat = lireEtat(t.answers) ?? etatInitial(VERSION_BANQUE, langueValide(opts.langue), maintenant);
  const prenom = t.prenom || undefined;

  const attendus = (await avancer(etat.reponses, etat.evaluations, null, prenom)).etape.items;
  const fusion: Reponses = { ...etat.reponses };
  let nouvelles = 0;
  for (const [k, v] of Object.entries(reponses as Record<string, unknown>)) {
    const id = Number(k);
    if (!attendus.includes(id) || typeof v !== "string") continue;
    fusion[id] = v.slice(0, 5000);
    nouvelles += 1;
  }
  // Rien d'attendu (envoi en double, bloc déjà rangé) : on renvoie l'état tel qu'il est.
  if (!nouvelles) return rouvrir(d, token);

  const { etape, evaluations } = await avancer(fusion, etat.evaluations, d.appelIA, prenom);
  const suivant: EtatPositionnement = {
    ...etat,
    langue: opts.langue === undefined ? etat.langue : langueValide(opts.langue),
    tour: etat.tour + 1,
    duree_secondes: Math.min(DUREE_MAX, etat.duree_secondes + secondesBornees(opts.secondes)),
    reponses: fusion,
    evaluations,
  };
  if (!etape.items.length) return cloturer(d, token, t, suivant, verrou, false, maintenant);
  if (!(await d.depot.enregistrerEtat(t, suivant, verrou))) return rouvrir(d, token);
  return { ok: true, etape: etapePublique(t, fusion, etape) };
}

/**
 * Clôt le test. `interfaceAbandon` : deux échecs à l'entraînement (toucher un rond, choisir une
 * image) → aucun classement, « À évaluer avec un accompagnant ». Accepté seulement avant toute
 * réponse (l'entraînement a lieu au début). Sinon, le parcours doit être fini.
 */
export async function terminerTest(
  d: Dependances,
  token: unknown,
  opts: { secondes?: unknown; interfaceAbandon?: unknown; langue?: unknown } = {},
): Promise<ResultatTest> {
  const t = await charger(d, token);
  if (!t) return { ok: false, error: LIEN_INVALIDE };
  if (t.status === "fait") return { ok: true, etape: { statut: "fait", prenom: t.prenom } };

  const maintenant = (d.maintenant ?? (() => new Date()))();
  const verrou = verrouDe(t);
  const lu = lireEtat(t.answers);
  const etat = lu ?? etatInitial(VERSION_BANQUE, langueValide(opts.langue), maintenant);
  const abandon = opts.interfaceAbandon === true;
  if (abandon && Object.keys(etat.reponses).length) return { ok: false, error: "Le test est déjà commencé." };
  if (!abandon) {
    const { etape } = await avancer(etat.reponses, etat.evaluations, d.appelIA, t.prenom || undefined);
    if (etape.items.length) return { ok: false, error: "Le test n'est pas terminé." };
  }
  const suivant: EtatPositionnement = {
    ...etat,
    tour: etat.tour + 1,
    duree_secondes: Math.min(DUREE_MAX, etat.duree_secondes + secondesBornees(opts.secondes)),
  };
  return cloturer(d, token, t, suivant, verrou, abandon, maintenant);
}

async function cloturer(
  d: Dependances,
  token: unknown,
  t: TestPositionnement,
  etat: EtatPositionnement,
  verrou: Verrou,
  abandon: boolean,
  maintenant: Date,
): Promise<ResultatTest> {
  const bilan = await terminerModule(etat.reponses, etat.evaluations, d.appelIA, {
    prenom: t.prenom || undefined,
    dureeSecondes: etat.duree_secondes,
    interfaceAbandon: abandon,
    date: maintenant.toISOString(),
  });
  const r = bilan.rapport;
  const level = niveauErp(r.global);
  const score = scoreSur100(bilan.corriges, { regle: r.global.regle, abandon });
  const final: EtatPositionnement = {
    ...etat,
    reponses: masquerPrenom(etat.reponses, t.prenom),
    evaluations: bilan.evaluations,
    termine_le: maintenant.toISOString(),
    ...(abandon ? { interface_abandon: true } : {}),
    rapport: r,
    profil: r.profil,
    niveau_erp: level,
    score,
  };
  const ok = await d.depot.cloturer(t, {
    answers: final,
    level,
    score,
    duration_seconds: etat.duree_secondes,
    completed_at: maintenant.toISOString(),
  }, verrou);
  // Un autre envoi est passé avant (double appui, deuxième onglet) : on renvoie son état.
  if (!ok) return rouvrir(d, token);
  // Le niveau attribué remplit la fiche apprenant (modifiable ensuite par l'équipe).
  await d.depot.majNiveauApprenant(t, level);
  return { ok: true, etape: { statut: "fait", prenom: t.prenom } };
}

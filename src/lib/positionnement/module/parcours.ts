// Parcours ADAPTATIF par compétence : chacun ne passe que les items utiles à son niveau.
// Durée cible : 30 minutes environ (décision du 23/10 ; avant : 20 minutes). Estimation :
// `dureeEstimee`, vérifiée par les tests sur des profils A1, A2, B1, B2 et « lit mal, comprend l'oral ».
//
// Algorithme (documenté aussi dans decisions/2026-10-15-test-positionnement.md) :
//
// 1. LITTÉRATIE (ordre fixe, repris de l'outil d'origine)
//    - Déclaratif : 101 (école ?), 102 (en français ? — sauté si jamais scolarisé·e).
//    - Raccourci : scolarisé·e « longtemps » → d'abord la lecture A1.1 (112, 113). 2/2 → sortie
//      haute immédiate. Sinon, bloc complet.
//    - Bloc complet : oral en images 103-105, lettres 106-108, nombre 109 → porte L0 ; déchiffrage
//      110-111 → porte L1 ; lecture 112-113 + nombre écrit 114 → porte L2. À chaque porte, UNE erreur
//      est tolérée : L0 = 2/3, L1 = 1/2, L2 = 2/3 (porteLitteratie, correction.ts).
//    - Seul L0 raté arrête le test (vrai non-lecteur) : on ne fait pas lire quelqu'un qui ne reconnaît
//      pas les lettres. On propose seulement UNE tâche orale A1 (se présenter) : l'oral et l'écrit sont
//      indépendants.
//    - L1 ou L2 raté (décision du 23/10) : le palier est noté (routerLitteratie → rapport) et le test
//      CONTINUE comme pour les autres, réception en A1. L1 raté : on ne passe pas les items de L2.
// 2. RÉCEPTION (CO, puis CE, puis Langue), niveau par niveau :
//    - Départ : CO en A1 (en A2 après une sortie haute rapide) ; CE au niveau atteint en CO (en A1
//      si un palier de littératie est noté) ; Langue au plus bas des niveaux CO et CE.
//    - À chaque niveau : 3 items quand la banque en a 3 (décision du 23/10 ; avant : 2, + 1 pour
//      départager). Acquis à 2/3 ; s'il n'y a que 2 items : 2/2 ; s'il n'y en a qu'1 : 1/1.
//      Langue (informative, hors niveau global) : 1 item par niveau, pour tenir la durée.
//    - Acquis → niveau suivant (jusqu'à B2). Non acquis au niveau de départ → on descend d'un niveau,
//      jusqu'à trouver un niveau acquis ou échouer en A1. Les niveaux sous un niveau de départ acquis
//      sont réputés acquis.
//    - Niveau de la compétence = plus haut niveau acquis ; aucun → « A1 non atteint ».
// 3. PRODUCTION (PO, puis PE), une tâche par niveau essayé :
//    - Départ au niveau de la compréhension correspondante (PO ← CO, PE ← CE ; A1 si non atteint).
//    - Tâche réussie (grille) → on essaie le niveau AU-DESSUS, et ainsi de suite jusqu'à B2 ou au
//      premier échec (décision du 23/10). La compétence vaut le plus haut niveau réussi : la
//      compréhension ne plafonne plus la production.
//    - Tâche de départ échouée → une tâche un niveau plus bas. Deux échecs → deux niveaux sous le
//      départ (estimé), ou « A1 non atteint ».
//
// Passations commencées avec l'ancien parcours : tout est recalculé à partir des réponses déjà
// données. Les réponses gardées servent ; les items qui manquent au nouveau parcours (3e item d'un
// niveau, suite du test après L1 ou L2 raté) sont demandés à l'étape suivante.

import { BANQUE, item, itemsDe } from "./banque.ts";
import { competencesLitteratie, porteLitteratie, routerLitteratie } from "./correction.ts";
import type { Competence, Item, Niveau, NiveauResultat, Reponses } from "./types.ts";
import { NIVEAUX } from "./types.ts";

/** Correction déjà connue d'un item répondu (serveur) ; undefined = pas encore répondu ou évalué. */
export type Juge = (q: Item) => boolean | undefined;

export interface TraceNiveau { items: number[]; reussis: number; acquis: boolean }
export interface TraceCompetence {
  competence: Competence;
  depart: Niveau;
  niveaux: Partial<Record<Niveau, TraceNiveau>>;
  niveau: NiveauResultat;
  /** Niveau déduit sans item à ce niveau (production après deux échecs). */
  estime?: boolean;
}
export interface Trace {
  litteratie: {
    items: number[];
    raccourci: boolean;
    /** Palier noté (Pré-alpha…) ; null = entrée dans l'écrit acquise. Arrêt seulement si L0 est raté. */
    palier: ReturnType<typeof routerLitteratie>;
    arret: boolean;
  };
  competences: Partial<Record<Competence, TraceCompetence>>;
  administres: number[];
  termine: boolean;
}

export interface Etape {
  /** Items à présenter maintenant (dans cet ordre). Vide quand le test est terminé. */
  items: number[];
  bloc: string;
  trace: Trace;
}

class EnAttente {
  constructor(public ids: number[], public bloc: string) {}
}

/**
 * À changer dès qu'une règle du parcours ou du niveau global change (la banque a sa propre version,
 * VERSION_BANQUE) : enregistrée dans chaque rapport (`versionParcours`).
 */
export const VERSION_PARCOURS = "2026-10-23.1";

/** Réception (CO, CE) : items passés par niveau quand la banque les a (décision du 23/10). */
export const ITEMS_PAR_NIVEAU = 3;
/** Langue : informative, 1 item par niveau pour tenir la durée cible. */
export const ITEMS_PAR_NIVEAU_LANGUE = 1;

/** Bonnes réponses pour qu'un niveau soit acquis : 2/3 (une erreur tolérée), 2/2, 1/1. */
export function seuilAcquis(nbItems: number): number {
  return nbItems >= 3 ? nbItems - 1 : nbItems;
}

const rang = (n: Niveau) => NIVEAUX.indexOf(n);
const niveauDe = (n: NiveauResultat): Niveau => (n === "infra_A1" || n === "non_evalue" ? "A1" : n);
const moinsUn = (n: Niveau): Niveau => NIVEAUX[Math.max(0, rang(n) - 1)];

/**
 * Déroule l'algorithme sur les réponses connues. Renvoie la prochaine étape (items à présenter) ou,
 * si tout est répondu, une étape vide avec la trace complète. Fonction pure : rejouable à l'identique.
 */
export function deroulerParcours(rep: Reponses, juge: Juge, prenom?: string): Etape {
  const trace: Trace = {
    litteratie: { items: [], raccourci: false, palier: null, arret: false },
    competences: {},
    administres: [],
    termine: false,
  };
  const repondu = (id: number) => rep[id] != null;
  const marquer = (ids: number[]) => { for (const id of ids) if (!trace.administres.includes(id)) trace.administres.push(id); };

  /** Demande des items : s'ils sont tous répondus et jugés, renvoie leurs corrections. */
  const demander = (ids: number[], bloc: string): boolean[] => {
    marquer(ids);
    const manquants = ids.filter((id) => !repondu(id) || juge(item(id)!) === undefined);
    if (manquants.length) throw new EnAttente(manquants, bloc);
    return ids.map((id) => juge(item(id)!) === true);
  };
  /** Bloc de littératie (réponses brutes, la porte est calculée par correction.ts). */
  const demanderLitteratie = (ids: number[], bloc: string) => {
    const a = ids.filter((id) => !(id === 102 && (rep[101] ?? "").startsWith("🏫❌")));
    for (const id of a) if (!trace.litteratie.items.includes(id)) trace.litteratie.items.push(id);
    marquer(a);
    const manquants = a.filter((id) => !repondu(id));
    if (manquants.length) throw new EnAttente(manquants, bloc);
  };

  const reception = (c: Competence, depart: Niveau, parNiveau: number) => {
    const t: TraceCompetence = { competence: c, depart, niveaux: {}, niveau: "infra_A1" };
    trace.competences[c] = t;
    let n: Niveau = depart;
    let sens: "monte" | "descend" = "monte";
    for (;;) {
      const ids = itemsDe(c, n).slice(0, parNiveau).map((q) => q.id);
      if (!ids.length) break;
      const reussis = demander(ids, `${c}-${n}`).filter(Boolean).length;
      const tn: TraceNiveau = { items: ids, reussis, acquis: reussis >= seuilAcquis(ids.length) };
      t.niveaux[n] = tn;
      if (tn.acquis) {
        if (sens === "monte" && rang(n) < 3) { n = NIVEAUX[rang(n) + 1]; continue; }
        break;
      }
      if (rang(n) > 0 && (sens === "descend" || n === depart)) { sens = "descend"; n = moinsUn(n); continue; }
      break;
    }
    const acquis = NIVEAUX.filter((x) => t.niveaux[x]?.acquis);
    t.niveau = acquis.length ? acquis[acquis.length - 1] : "infra_A1";
    return t.niveau;
  };

  /** `seule` : une seule tâche, sans montée ni descente (arrêt au bloc littératie). */
  const production = (c: "PO" | "PE", depart: Niveau, seule = false) => {
    const t: TraceCompetence = { competence: c, depart, niveaux: {}, niveau: "infra_A1" };
    trace.competences[c] = t;
    const essayer = (n: Niveau) => {
      const q = itemsDe(c, n)[0];
      if (!q) return false;
      const [ok] = demander([q.id], `${c}-${n}`);
      t.niveaux[n] = { items: [q.id], reussis: ok ? 1 : 0, acquis: ok };
      return ok;
    };
    if (essayer(depart)) {
      // Réussite : on monte tant que la tâche du niveau au-dessus est réussie.
      t.niveau = depart;
      let n = depart;
      while (!seule && rang(n) < 3) {
        const haut = NIVEAUX[rang(n) + 1];
        if (!essayer(haut)) break;
        n = haut;
        t.niveau = haut;
      }
      return;
    }
    if (seule || rang(depart) === 0) return;
    const bas = moinsUn(depart);
    if (essayer(bas)) { t.niveau = bas; return; }
    if (rang(bas) > 0) { t.niveau = moinsUn(bas); t.estime = true; }
  };

  try {
    // ── 1. Littératie ──
    demanderLitteratie([101, 102], "litteratie-declaratif");
    let sortieHaute = false;
    if ((rep[101] ?? "").startsWith("🏫🎓")) {
      trace.litteratie.raccourci = true;
      demanderLitteratie([112, 113], "litteratie-lecture");
      sortieHaute = competencesLitteratie(BANQUE, rep, prenom).lecture === 2 && rep[106] == null;
    }
    if (!sortieHaute) {
      demanderLitteratie([103, 104, 105, 106, 107, 108, 109], "litteratie-L0");
      if (!porteLitteratie(BANQUE, rep, "L0", prenom)) {
        // Vrai non-lecteur : arrêt, une seule tâche orale A1 (l'oral n'attend pas l'écrit).
        trace.litteratie.palier = routerLitteratie(BANQUE, rep, prenom);
        trace.litteratie.arret = true;
        production("PO", "A1", true);
        trace.termine = true;
        return { items: [], bloc: "fin", trace };
      }
      demanderLitteratie([110, 111], "litteratie-L1");
      if (porteLitteratie(BANQUE, rep, "L1", prenom)) demanderLitteratie([112, 113, 114], "litteratie-L2");
      // L1 ou L2 raté : le palier est noté, le test continue (départ en A1).
      trace.litteratie.palier = routerLitteratie(BANQUE, rep, prenom);
    }

    // ── 2. Réception ──
    const co = reception("CO", sortieHaute ? "A2" : "A1", ITEMS_PAR_NIVEAU);
    // Palier de littératie noté (L1 ou L2 raté) : la lecture commence en A1, pas au niveau de la CO.
    const ce = reception("CE", trace.litteratie.palier ? "A1" : niveauDe(co), ITEMS_PAR_NIVEAU);
    const plusBas = rang(niveauDe(co)) <= rang(niveauDe(ce)) ? niveauDe(co) : niveauDe(ce);
    reception("LANGUE", plusBas, ITEMS_PAR_NIVEAU_LANGUE);

    // ── 3. Production ──
    production("PO", niveauDe(co));
    production("PE", niveauDe(ce));

    trace.termine = true;
    return { items: [], bloc: "fin", trace };
  } catch (e) {
    if (e instanceof EnAttente) return { items: e.ids, bloc: e.bloc, trace };
    throw e;
  }
}

// ══════════════════════ Durée estimée ══════════════════════

/** Durée cible du test (secondes) : 30 minutes environ (décision du 23/10). */
export const DUREE_CIBLE = 30 * 60;

/** Durée de réponse estimée (secondes) : sert à vérifier la cible de 30 minutes. */
export function dureeEstimee(q: Item): number {
  if (q.competence === "LITTERATIE") return 12;
  if (q.type === "oral") return (q.dureeMax ?? 60) + 30; // consigne + enregistrement + relecture
  if (q.type === "written" || q.type === "reformulate") {
    return ({ A1: 120, A2: 200, B1: 300, B2: 360 } as Record<string, number>)[q.level] ?? 200;
  }
  if (q.competence === "LANGUE") return 25;
  if (q.type === "listen_choose") return 40;
  return Math.round(((q.timeLimit as number) ?? 60) * 0.5);
}

/** Temps d'accueil, de consentement et de transitions (secondes). */
export const DUREE_ACCUEIL = 60;

export function dureeParcours(ids: number[]): number {
  return DUREE_ACCUEIL + ids.reduce((s, id) => s + dureeEstimee(item(id)!), 0);
}

// Parcours ADAPTATIF par compétence : chacun ne passe que les items utiles à son niveau.
// Durée cible ≤ 20 minutes (estimation : `dureeEstimee`, vérifiée par les tests sur des profils A1→B2).
//
// Algorithme (documenté aussi dans decisions/2026-10-15-test-positionnement.md) :
//
// 1. LITTÉRATIE (ordre fixe, repris de l'outil d'origine)
//    - Déclaratif : 101 (école ?), 102 (en français ? — sauté si jamais scolarisé·e).
//    - Raccourci : scolarisé·e « longtemps » → d'abord la lecture A1.1 (112, 113). 2/2 → sortie
//      haute immédiate. Sinon, bloc complet.
//    - Bloc complet : oral en images 103-105, lettres 106-108, nombre 109 → palier L0 (≥ 2/3 lettres),
//      déchiffrage 110-111 → palier L1 (≥ 1/2), lecture 112-113 + nombre écrit 114 → palier L2 (2/2).
//    - Arrêt à un palier : on ne fait pas lire quelqu'un qui n'est pas entré dans l'écrit. On propose
//      seulement UNE tâche orale A1 (se présenter) : l'oral et l'écrit sont indépendants.
// 2. RÉCEPTION (CO, puis CE, puis Langue), niveau par niveau :
//    - Départ : CO en A1 (en A2 après une sortie haute rapide) ; CE au niveau atteint en CO ;
//      Langue au plus bas des niveaux CO et CE.
//    - À chaque niveau : 2 items. 2/2 → niveau acquis ; 0/2 → non acquis ; 1/2 → un 3e item tranche.
//      (Langue, informative : 1 item par niveau.)
//    - Acquis → niveau suivant (jusqu'à B2). Non acquis au niveau de départ → on descend d'un niveau,
//      jusqu'à trouver un niveau acquis ou échouer en A1. Les niveaux sous un niveau de départ acquis
//      sont réputés acquis.
//    - Niveau de la compétence = plus haut niveau acquis ; aucun → « A1 non atteint ».
// 3. PRODUCTION (PO, puis PE), une tâche, deux au plus :
//    - Départ au niveau de la compréhension correspondante (PO ← CO, PE ← CE ; A1 si non atteint).
//    - Tâche réussie (grille) → niveau de départ. Échouée → une tâche un niveau plus bas.
//      Deux échecs → deux niveaux sous le départ (estimé), ou « A1 non atteint ».
//    - Le niveau de production est donc plafonné par la compréhension : c'est le cas général, et le
//      formateur peut le relever en entretien.

import { BANQUE, item, itemsDe } from "./banque.ts";
import { porteLitteratie, routerLitteratie } from "./correction.ts";
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
    /** Palier d'arrêt (Pré-alpha…) ; null = entrée dans l'écrit acquise. */
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

  const reception = (c: Competence, depart: Niveau, parNiveau: 1 | 2) => {
    const t: TraceCompetence = { competence: c, depart, niveaux: {}, niveau: "infra_A1" };
    trace.competences[c] = t;
    let n: Niveau = depart;
    let sens: "monte" | "descend" = "monte";
    for (;;) {
      const dispo = itemsDe(c, n);
      if (!dispo.length) break;
      const premiers = dispo.slice(0, parNiveau).map((q) => q.id);
      const res = demander(premiers, `${c}-${n}`);
      let reussis = res.filter(Boolean).length;
      const tn: TraceNiveau = { items: [...premiers], reussis, acquis: false };
      if (parNiveau === 1) tn.acquis = reussis === 1;
      else if (reussis === 2) tn.acquis = true;
      else if (reussis === 1 && dispo[2]) {
        tn.items.push(dispo[2].id);
        t.niveaux[n] = tn;
        const [r3] = demander([dispo[2].id], `${c}-${n}`);
        if (r3) reussis += 1;
        tn.reussis = reussis;
        tn.acquis = r3;
      }
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

  const production = (c: "PO" | "PE", depart: Niveau, descente = true) => {
    const t: TraceCompetence = { competence: c, depart, niveaux: {}, niveau: "infra_A1" };
    trace.competences[c] = t;
    const essayer = (n: Niveau) => {
      const q = itemsDe(c, n)[0];
      if (!q) return false;
      const [ok] = demander([q.id], `${c}-${n}`);
      t.niveaux[n] = { items: [q.id], reussis: ok ? 1 : 0, acquis: ok };
      return ok;
    };
    if (essayer(depart)) { t.niveau = depart; return; }
    if (!descente || rang(depart) === 0) return;
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
      sortieHaute = porteLitteratie(BANQUE, rep, "L2", prenom) && rep[106] == null;
    }
    if (!sortieHaute) {
      demanderLitteratie([103, 104, 105, 106, 107, 108, 109], "litteratie-L0");
      let ok = porteLitteratie(BANQUE, rep, "L0", prenom);
      if (ok) { demanderLitteratie([110, 111], "litteratie-L1"); ok = porteLitteratie(BANQUE, rep, "L1", prenom); }
      if (ok) { demanderLitteratie([112, 113, 114], "litteratie-L2"); ok = porteLitteratie(BANQUE, rep, "L2", prenom); }
      trace.litteratie.palier = routerLitteratie(BANQUE, rep, prenom);
      if (!ok) {
        trace.litteratie.arret = true;
        // Arrêt : une seule tâche orale A1 (l'oral n'attend pas l'écrit).
        production("PO", "A1", false);
        trace.termine = true;
        return { items: [], bloc: "fin", trace };
      }
    }

    // ── 2. Réception ──
    const co = reception("CO", sortieHaute ? "A2" : "A1", 2);
    const ce = reception("CE", niveauDe(co), 2);
    const plusBas = rang(niveauDe(co)) <= rang(niveauDe(ce)) ? niveauDe(co) : niveauDe(ce);
    reception("LANGUE", plusBas, 1);

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

/** Durée de réponse estimée (secondes) : sert à vérifier la cible de 20 minutes. */
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

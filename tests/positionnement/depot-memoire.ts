// Base en mémoire pour tester le service du test de positionnement sans Supabase : mêmes
// règles que depot-supabase.ts (ligne visée par id + org_id + learner_id, status en_attente,
// verrou sur le numéro de tour).
import type { Cloture, DepotPositionnement, TestPositionnement, Verrou } from "@/lib/positionnement/service";
import type { EtatPositionnement } from "@/lib/positionnement/etat";

export interface LigneTest {
  id: string;
  org_id: string;
  learner_id: string;
  token: string;
  status: "en_attente" | "fait";
  purpose: string;
  answers: unknown;
  level: string | null;
  score: number | null;
  duration_seconds: number | null;
  completed_at: string | null;
}

export function depotMemoire(lignes: LigneTest[], apprenants: Record<string, { org_id: string; first_name: string; level_assessed: string | null }>) {
  const ecritures: string[] = [];
  const passeVerrou = (l: LigneTest, v: Verrou) => {
    const a = l.answers as { modele?: string; tour?: number } | null;
    return v === "neuf" ? !a || Array.isArray(a) || a.modele == null : !Array.isArray(a) && a?.tour === v.tour;
  };
  const cible = (t: TestPositionnement) =>
    lignes.find((l) => l.id === t.id && l.org_id === t.org_id && l.learner_id === t.learner_id && l.status === "en_attente");

  const depot: DepotPositionnement = {
    async testParJeton(token) {
      const l = lignes.find((x) => x.token === token);
      if (!l) return null;
      return {
        id: l.id, org_id: l.org_id, learner_id: l.learner_id, status: l.status, purpose: l.purpose,
        answers: structuredClone(l.answers), prenom: (apprenants[l.learner_id]?.first_name ?? "").split(/\s+/)[0],
      };
    },
    async enregistrerEtat(t, etat: EtatPositionnement, verrou) {
      const l = cible(t);
      if (!l || !passeVerrou(l, verrou)) return false;
      l.answers = structuredClone(etat);
      ecritures.push(`etat:${etat.tour}`);
      return true;
    },
    async cloturer(t, fin: Cloture, verrou) {
      const l = cible(t);
      if (!l || !passeVerrou(l, verrou)) return false;
      Object.assign(l, { status: "fait", answers: structuredClone(fin.answers), level: fin.level, score: fin.score, duration_seconds: fin.duration_seconds, completed_at: fin.completed_at });
      ecritures.push("cloture");
      return true;
    },
    async majNiveauApprenant(t, niveau) {
      const a = apprenants[t.learner_id];
      if (a && a.org_id === t.org_id) a.level_assessed = niveau;
      ecritures.push(`niveau:${niveau}`);
    },
  };
  return { depot, ecritures };
}

export function ligneTest(partiel: Partial<LigneTest> = {}): LigneTest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    org_id: "org-prod",
    learner_id: "apprenant-1",
    token: "22222222-2222-4222-8222-222222222222",
    status: "en_attente",
    purpose: "positionnement",
    answers: null,
    level: null,
    score: null,
    duration_seconds: null,
    completed_at: null,
    ...partiel,
  };
}

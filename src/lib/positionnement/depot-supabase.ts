// Accès à la base du test de positionnement (client service_role, SERVEUR UNIQUEMENT).
// La page publique /test/[token] n'a pas de compte : le jeton est le secret. On lit le test par
// son jeton, puis TOUTE écriture vise cette ligne-là (id + org_id + learner_id du test) et la
// fiche de CET apprenant dans CET organisme : jamais d'accès au bac à sable autrement que par
// son propre jeton.

import { createAdminClient } from "@/lib/supabase/admin";
import type { DepotPositionnement, TestPositionnement, Verrou } from "./service";

type Admin = ReturnType<typeof createAdminClient>;

/** Filtre du verrou : même numéro de tour, ou rien de rangé au format v2 (null, ancien tableau). */
function avecVerrou<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q }>(q: Q, verrou: Verrou): Q {
  return verrou === "neuf" ? q.is("answers->>modele", null) : q.eq("answers->>tour", String(verrou.tour));
}

export function depotSupabase(admin: Admin = createAdminClient()): DepotPositionnement {
  return {
    async testParJeton(token) {
      const { data } = await admin
        .from("placement_tests")
        .select("id, org_id, learner_id, status, purpose, answers, learners(first_name)")
        .eq("token", token)
        .maybeSingle();
      if (!data) return null;
      const prenom = ((data.learners as unknown as { first_name: string | null } | null)?.first_name ?? "").trim().split(/\s+/)[0] ?? "";
      return {
        id: data.id,
        org_id: data.org_id,
        learner_id: data.learner_id,
        status: data.status as TestPositionnement["status"],
        purpose: data.purpose ?? null,
        answers: data.answers,
        prenom,
      };
    },

    async enregistrerEtat(t, etat, verrou) {
      const q = admin
        .from("placement_tests")
        .update({ answers: etat })
        .eq("id", t.id)
        .eq("org_id", t.org_id)
        .eq("learner_id", t.learner_id)
        .eq("status", "en_attente");
      const { data, error } = await avecVerrou(q, verrou).select("id");
      if (error) console.error(`[positionnement] état non rangé : ${error.message}`);
      return !error && (data?.length ?? 0) === 1;
    },

    async cloturer(t, fin, verrou) {
      const q = admin
        .from("placement_tests")
        .update({
          status: "fait",
          answers: fin.answers,
          level: fin.level,
          score: fin.score,
          duration_seconds: fin.duration_seconds,
          completed_at: fin.completed_at,
        })
        .eq("id", t.id)
        .eq("org_id", t.org_id)
        .eq("learner_id", t.learner_id)
        .eq("status", "en_attente");
      const { data, error } = await avecVerrou(q, verrou).select("id");
      if (error) console.error(`[positionnement] clôture impossible : ${error.message}`);
      return !error && (data?.length ?? 0) === 1;
    },

    async majNiveauApprenant(t, niveau) {
      const { error } = await admin
        .from("learners")
        .update({ level_assessed: niveau })
        .eq("id", t.learner_id)
        .eq("org_id", t.org_id);
      if (error) console.error(`[positionnement] niveau non recopié sur la fiche : ${error.message}`);
    },
  };
}

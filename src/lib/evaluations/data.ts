import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_LABELS, type EvaluationKind, type Mark } from "@/lib/evaluations/grid";
import { computeMilestones, type Milestone, type MilestoneSession } from "@/lib/evaluations/milestones";

// Données de la page « Évaluations » d'un groupe : inscrits, niveau d'entrée, tests de
// mi-parcours / finale, grilles saisies, jalons.

export type EvaluationTestInfo = { id: string; token: string; status: "en_attente" | "fait"; score: number | null; level: string | null; completedAt: string | null };

export type EvaluationEntry = {
  id: string;
  co: Mark | null;
  po: Mark | null;
  ce: Mark | null;
  pe: Mark | null;
  levelReached: string | null;
  comment: string | null;
  evaluatedAt: string | null;
};

export type EvaluationLearnerRow = {
  learnerId: string;
  firstName: string;
  lastName: string;
  learnerNo: number | null;
  phone: string | null;
  email: string | null;
  entryLevel: string | null; // niveau évalué à l'entrée (fiche apprenant)
  tests: Record<EvaluationKind, EvaluationTestInfo | null>;
  evals: Record<EvaluationKind, EvaluationEntry | null>;
};

export type GroupEvaluations = {
  group: {
    id: string;
    name: string;
    trainerName: string | null;
    targetLevel: string | null; // niveau visé du dispositif
    entryLevel: string | null; // niveau d'entrée du dispositif
    midtermOn: string | null;
    finalOn: string | null;
    status: string;
  };
  milestones: { midterm: Milestone; final: Milestone };
  rows: EvaluationLearnerRow[];
};

export const KINDS: EvaluationKind[] = ["mi_parcours", "finale"];
export { KIND_LABELS };

export async function loadGroupEvaluations(supabase: SupabaseClient, groupId: string): Promise<GroupEvaluations | null> {
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, status, midterm_on, final_on, programs(level, entry_level), trainers:trainer_id(first_name, last_name)")
    .eq("id", groupId)
    .single();
  if (!group) return null;

  const [{ data: sessions }, { data: enrollments }, { data: tests }, { data: evals }] = await Promise.all([
    supabase.from("sessions").select("starts_at, ends_at, status").eq("group_id", groupId),
    supabase
      .from("enrollments")
      .select("learner_id, learners(id, first_name, last_name, learner_no, phone, email, level_assessed)")
      .eq("group_id", groupId)
      .eq("status", "inscrit"),
    supabase
      .from("placement_tests")
      .select("id, learner_id, token, status, score, level, completed_at, purpose, created_at")
      .eq("group_id", groupId)
      .in("purpose", KINDS)
      .order("created_at", { ascending: false }),
    supabase
      .from("evaluations")
      .select("id, learner_id, kind, co, po, ce, pe, level_reached, comment, evaluated_at")
      .eq("group_id", groupId),
  ]);

  const program = group.programs as unknown as { level: string | null; entry_level: string | null } | null;
  const trainer = group.trainers as unknown as { first_name: string; last_name: string | null } | null;
  const milestones = computeMilestones((sessions ?? []) as MilestoneSession[], { midterm_on: group.midterm_on, final_on: group.final_on });

  const rows: EvaluationLearnerRow[] = (enrollments ?? [])
    .map((e) => e.learners as unknown as { id: string; first_name: string; last_name: string; learner_no: number | null; phone: string | null; email: string | null; level_assessed: string | null } | null)
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"))
    .map((l) => {
      const testFor = (kind: EvaluationKind): EvaluationTestInfo | null => {
        const t = (tests ?? []).find((x) => x.learner_id === l.id && x.purpose === kind); // le plus récent (tri desc)
        return t ? { id: t.id, token: t.token, status: t.status as "en_attente" | "fait", score: t.score == null ? null : Number(t.score), level: t.level, completedAt: t.completed_at } : null;
      };
      const evalFor = (kind: EvaluationKind): EvaluationEntry | null => {
        const v = (evals ?? []).find((x) => x.learner_id === l.id && x.kind === kind);
        return v ? { id: v.id, co: v.co, po: v.po, ce: v.ce, pe: v.pe, levelReached: v.level_reached, comment: v.comment, evaluatedAt: v.evaluated_at } : null;
      };
      return {
        learnerId: l.id,
        firstName: l.first_name,
        lastName: l.last_name,
        learnerNo: l.learner_no,
        phone: l.phone,
        email: l.email,
        entryLevel: l.level_assessed,
        tests: { mi_parcours: testFor("mi_parcours"), finale: testFor("finale") },
        evals: { mi_parcours: evalFor("mi_parcours"), finale: evalFor("finale") },
      };
    });

  return {
    group: {
      id: group.id,
      name: group.name,
      status: group.status,
      trainerName: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
      targetLevel: program?.level ?? null,
      entryLevel: program?.entry_level ?? null,
      midtermOn: group.midterm_on,
      finalOn: group.final_on,
    },
    milestones,
    rows,
  };
}

/** Nombre d'évaluations saisies (au moins une compétence) pour un jalon. */
export function countDone(rows: EvaluationLearnerRow[], kind: EvaluationKind): number {
  return rows.filter((r) => {
    const e = r.evals[kind];
    return e && (e.co || e.po || e.ce || e.pe);
  }).length;
}

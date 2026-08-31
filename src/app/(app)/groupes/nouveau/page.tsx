import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupWizard } from "@/components/groupes/group-wizard";

export default async function NouveauGroupePage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: programs }, { data: funders }, { data: trainers }, { data: rooms }, { data: learners }, { data: activeEnrollments }] = await Promise.all([
    // select("*") : tolérant aux colonnes récentes (preferred_trainer_id) pas encore migrées
    supabase.from("programs").select("*").eq("is_active", true).order("name"),
    supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("trainers").select("id, first_name, last_name").eq("is_active", true).order("priority"),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("learners").select("id, first_name, last_name, level_assessed").order("last_name"),
    supabase
      .from("enrollments")
      .select("learner_id, groups!inner(status)")
      .eq("status", "inscrit")
      .in("groups.status", ["en_attente", "ouvert", "complet"]),
  ]);

  const busyIds = new Set((activeEnrollments ?? []).map((e) => e.learner_id));
  const availableLearners = (learners ?? []).map((l) => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name}`,
    level: l.level_assessed,
    busy: busyIds.has(l.id),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau groupe</h1>
      <GroupWizard
        programs={programs ?? []}
        funders={funders ?? []}
        trainers={(trainers ?? []).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name ?? ""}`.trim() }))}
        rooms={rooms ?? []}
        learners={availableLearners}
      />
    </div>
  );
}

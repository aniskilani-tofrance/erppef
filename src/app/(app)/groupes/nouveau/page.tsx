import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupWizard } from "@/components/groupes/group-wizard";

export default async function NouveauGroupePage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: programs }, { data: funders }, { data: trainers }, { data: rooms }] = await Promise.all([
    // select("*") : tolérant aux colonnes récentes (preferred_trainer_id) pas encore migrées
    supabase.from("programs").select("*").eq("is_active", true).order("name"),
    supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("trainers").select("id, first_name, last_name").eq("is_active", true).order("priority"),
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau groupe</h1>
      <GroupWizard
        programs={programs ?? []}
        funders={funders ?? []}
        trainers={(trainers ?? []).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name ?? ""}`.trim() }))}
        rooms={rooms ?? []}
      />
    </div>
  );
}

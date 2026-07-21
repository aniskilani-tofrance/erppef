import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupWizard } from "@/components/groupes/group-wizard";

export default async function NouveauGroupePage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: programs }, { data: funders }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, code, name, total_hours, default_weekly_hours, default_funder_id, level")
      .eq("is_active", true)
      .order("name"),
    supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau groupe</h1>
      <GroupWizard programs={programs ?? []} funders={funders ?? []} />
    </div>
  );
}

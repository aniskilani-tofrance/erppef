import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlanningCalendar } from "@/components/planning/planning-calendar";

export default async function PlanningPage() {
  const { role } = await requireSession();
  const supabase = await createClient();

  const trainersQuery =
    role === "admin" || role === "coordinator"
      ? supabase.from("trainers").select("id, first_name, last_name").eq("is_active", true).order("priority")
      : supabase.from("v_trainers_public").select("id, first_name, last_name").eq("is_active", true);

  const [{ data: trainers }, { data: rooms }, { data: funders }] = await Promise.all([
    trainersQuery,
    supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
    supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
      <PlanningCalendar
        canEdit={role === "admin" || role === "coordinator"}
        trainers={(trainers ?? []).map((t) => ({
          id: t.id,
          name: `${t.first_name} ${t.last_name ?? ""}`.trim(),
        }))}
        rooms={rooms ?? []}
        funders={funders ?? []}
      />
    </div>
  );
}

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PlanningCalendar } from "@/components/planning/planning-calendar";

export default async function PlanningPage() {
  const { role, orgId } = await requireSession();
  const supabase = await createClient();

  const trainersQuery =
    role === "admin" || role === "coordinator"
      ? supabase.from("trainers").select("id, first_name, last_name").eq("is_active", true).order("priority")
      : supabase.from("v_trainers_public").select("id, first_name, last_name").eq("is_active", true);

  const [{ data: trainers }, { data: rooms }, { data: funders }, { data: org }, { data: closures }] =
    await Promise.all([
      trainersQuery,
      supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
      supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
      supabase.from("organizations").select("school_holiday_zone").eq("id", orgId).single(),
      supabase.from("calendar_closures").select("id, kind, zone, label, starts_on, ends_on"),
    ]);

  // Même filtre que le moteur : globales (fériés + vacances de notre zone) + fermetures de l'org.
  const zone = org?.school_holiday_zone;
  const applicableClosures = (closures ?? []).filter(
    (c) => !(c.kind === "vacances_scolaires" && c.zone && c.zone !== zone),
  );

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
        closures={applicableClosures.map((c) => ({
          id: c.id,
          label: c.label,
          startsOn: c.starts_on,
          endsOn: c.ends_on,
        }))}
      />
    </div>
  );
}

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

  const [{ data: trainers }, { data: rooms }, { data: funders }, { data: org }, { data: closures }, { data: absences }, { data: groups }] =
    await Promise.all([
      trainersQuery,
      supabase.from("rooms").select("id, name").eq("is_active", true).order("name"),
      supabase.from("funders").select("id, name, color").eq("is_active", true).order("name"),
      supabase.from("organizations").select("school_holiday_zone").eq("id", orgId).single(),
      supabase.from("calendar_closures").select("id, kind, zone, label, starts_on, ends_on"),
      supabase.from("trainer_absences").select("id, trainer_id, starts_on, ends_on, kind"),
      supabase
        .from("groups")
        .select("id, name, trainer_id, room_id")
        .in("status", ["en_attente", "ouvert", "complet"])
        .order("starts_on", { ascending: false }),
    ]);

  // Même filtre que le moteur : globales (fériés + vacances de notre zone) + fermetures de l'org.
  const zone = org?.school_holiday_zone;
  const applicableClosures = (closures ?? []).filter(
    (c) => !(c.kind === "vacances_scolaires" && c.zone && c.zone !== zone),
  );

  // Nom des formateurs résolu depuis la liste déjà chargée (v_trainers_public pour
  // les rôles trainer/viewer — pas de jointure directe sur trainers).
  const trainerNameOf = new Map(
    (trainers ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name ?? ""}`.trim()]),
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
        absences={(absences ?? [])
          .filter((a) => trainerNameOf.has(a.trainer_id))
          .map((a) => ({
            id: a.id,
            trainerId: a.trainer_id,
            trainerName: trainerNameOf.get(a.trainer_id)!,
            startsOn: a.starts_on,
            endsOn: a.ends_on,
            kind: a.kind,
          }))}
        groups={(groups ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          trainerId: g.trainer_id,
          roomId: g.room_id,
        }))}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainerFormDialog } from "@/components/formateurs/trainer-form-dialog";
import { AvailabilityEditor } from "@/components/formateurs/availability-editor";
import { AbsenceManager } from "@/components/formateurs/absence-manager";
import { InviteTrainerButton } from "@/components/formateurs/invite-trainer-button";

export default async function FormateurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();

  const [{ data: trainer }, { data: availabilities }, { data: absences }, { data: membership }] = await Promise.all([
    supabase.from("trainers").select("*").eq("id", id).single(),
    supabase.from("trainer_availabilities").select("*").eq("trainer_id", id).order("weekday").order("start_time"),
    supabase.from("trainer_absences").select("*").eq("trainer_id", id).order("starts_on", { ascending: false }),
    supabase.from("memberships").select("id").eq("trainer_id", id).maybeSingle(),
  ]);

  if (!trainer) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {trainer.first_name} {trainer.last_name}
        </h1>
        <Badge variant="outline">{trainer.contract_type === "salarie" ? "Salarié" : "Vacataire"}</Badge>
        {!trainer.is_active && <Badge variant="destructive">Inactif</Badge>}
        {membership && <Badge variant="secondary">Compte ERP actif</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {trainer.email && (
            <InviteTrainerButton trainerId={trainer.id} hasAccount={Boolean(membership)} />
          )}
          <TrainerFormDialog
            initial={{
              id: trainer.id,
              photoUrl: trainer.photo_url ?? null,
              firstName: trainer.first_name,
              lastName: trainer.last_name ?? "",
              email: trainer.email ?? "",
              phone: trainer.phone ?? "",
              contractType: trainer.contract_type,
              hourlyCost: String(trainer.hourly_cost),
              weeklyHoursMax: String(trainer.weekly_hours_max),
              priority: String(trainer.priority),
              skills: (trainer.skills ?? []).join(", "),
              languages: (trainer.languages ?? []).join(", "),
              isActive: trainer.is_active,
            }}
          />
          <Link href="/formateurs" className="text-sm text-muted-foreground hover:underline">
            ← Tous les formateurs
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
          <Info label="Coût horaire" value={`${Number(trainer.hourly_cost).toLocaleString("fr-FR")} €/h`} />
          <Info label="Plafond hebdo" value={`${Number(trainer.weekly_hours_max)} h`} />
          <Info label="Priorité" value={String(trainer.priority)} />
          <Info label="Langues" value={(trainer.languages ?? []).join(", ") || "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disponibilités récurrentes</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityEditor
            trainerId={trainer.id}
            initial={(availabilities ?? []).map((a) => ({
              weekday: a.weekday,
              start: a.start_time.slice(0, 5),
              end: a.end_time.slice(0, 5),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absences et congés</CardTitle>
        </CardHeader>
        <CardContent>
          <AbsenceManager
            trainerId={trainer.id}
            absences={(absences ?? []).map((a) => ({
              id: a.id,
              startsOn: a.starts_on,
              endsOn: a.ends_on,
              kind: a.kind,
              note: a.note,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

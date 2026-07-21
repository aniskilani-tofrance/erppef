import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { weekStartOf } from "@/lib/dates";
import { TrainerFormDialog } from "@/components/formateurs/trainer-form-dialog";

export default async function FormateursPage() {
  await requireRole(["admin", "coordinator"]);
  const supabase = await createClient();
  const weekStart = weekStartOf(new Date().toISOString().slice(0, 10));

  const [{ data: trainers }, { data: loads }, { data: totals }] = await Promise.all([
    supabase.from("trainers").select("*").order("priority").order("last_name"),
    supabase.from("v_trainer_week_load").select("*").eq("week_start", weekStart),
    supabase.from("v_trainer_hours").select("*"),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Formateurs</h1>
        <TrainerFormDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(trainers ?? []).map((t) => {
          const load = (loads ?? []).find((l) => l.trainer_id === t.id);
          const planned = load ? Number(load.hours_planned) : 0;
          const max = Number(t.weekly_hours_max);
          const rate = max > 0 ? Math.round((planned / max) * 100) : 0;
          const total = (totals ?? []).find((x) => x.trainer_id === t.id);
          return (
            <Link key={t.id} href={`/formateurs/${t.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      {t.photo_url && <AvatarImage src={t.photo_url} alt="" />}
                      <AvatarFallback style={{ backgroundColor: t.color ?? undefined }}>
                        {t.first_name[0]}
                        {t.last_name?.[0] ?? ""}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">
                          {t.first_name} {t.last_name}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {t.contract_type === "salarie" ? "Salarié" : "Vacataire"}
                        </Badge>
                        {!t.is_active && <Badge variant="destructive" className="text-xs">Inactif</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {Number(t.hourly_cost).toLocaleString("fr-FR")} €/h · plafond {max} h/sem · priorité {t.priority}
                      </p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>
                            {Math.round(planned * 10) / 10} / {max} h cette semaine
                          </span>
                          <span className={rate > 100 ? "font-semibold text-destructive" : ""}>{rate} %</span>
                        </div>
                        <Progress value={Math.min(rate, 100)} />
                      </div>
                      {total && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {Math.round(Number(total.hours_done))} h réalisées · {Math.round(Number(total.hours_upcoming))} h à venir
                        </p>
                      )}
                      {t.skills?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.skills.map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-xs font-normal">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

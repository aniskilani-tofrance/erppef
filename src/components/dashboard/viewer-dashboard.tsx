import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { utcToLocalTime, weekStartOf } from "@/lib/dates";
import { CalendarDays, UsersRound } from "lucide-react";

// Accueil LECTURE SEULE : vue générale sans indicateurs de pilotage ni coûts.
export async function ViewerDashboard() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(today);

  const [groups, weekLoads, { data: upcoming }] = await Promise.all([
    supabase.from("groups").select("id", { count: "exact", head: true }).in("status", ["ouvert", "complet", "en_attente"]),
    supabase.from("v_trainer_week_load").select("hours_planned").eq("week_start", weekStart),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, groups(name), rooms:room_id(name)")
      .neq("status", "annulee")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(6),
  ]);

  const hoursThisWeek = (weekLoads.data ?? []).reduce((s, l) => s + Number(l.hours_planned), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <UsersRound className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Groupes actifs</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{groups.count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Heures cette semaine</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{Math.round(hoursThisWeek * 10) / 10} h</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prochaines séances</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(upcoming ?? []).length === 0 && (
              <li className="text-muted-foreground">Aucune séance à venir.</li>
            )}
            {(upcoming ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">
                  {new Date(s.starts_at).toLocaleDateString("fr-FR", {
                    weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris",
                  })}
                </span>
                <span className="w-28">{utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}</span>
                <span className="font-medium">{(s.groups as unknown as { name: string } | null)?.name}</span>
                <span className="text-muted-foreground">{(s.rooms as unknown as { name: string } | null)?.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link href="/planning" className="text-sm text-muted-foreground hover:underline">
              Voir le planning →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

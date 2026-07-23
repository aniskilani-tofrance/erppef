import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { utcToLocalDate, utcToLocalTime, weekStartOf, nextDay } from "@/lib/dates";
import { ClipboardCheck } from "lucide-react";

// Accueil du FORMATEUR : sa journée, ses feuilles à clôturer, sa semaine.
// Pas d'occupation de salles ni d'indicateurs de pilotage : ce n'est pas son sujet.
export async function TrainerDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase.from("memberships").select("trainer_id").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
  ]);
  const firstName = profile?.full_name?.split(/\s+/)[0] ?? "";

  if (!membership?.trainer_id) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Votre compte n&apos;est pas encore relié à une fiche formateur : demandez à votre
          coordinateur de vous (ré)inviter depuis votre fiche.
        </p>
      </div>
    );
  }

  const trainerId = membership.trainer_id;
  const now = new Date();
  const today = utcToLocalDate(now.toISOString());
  const weekStart = weekStartOf(today);
  let weekEnd = weekStart;
  for (let i = 0; i < 7; i++) weekEnd = nextDay(weekEnd);

  const [{ data: weekSessions }, { data: toClose }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, attendance_closed_at, groups(name), rooms:room_id(name)")
      .eq("trainer_id", trainerId)
      .neq("status", "annulee")
      .gte("starts_at", `${weekStart}T00:00:00Z`)
      .lt("starts_at", `${weekEnd}T00:00:00Z`)
      .order("starts_at"),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, groups(name)")
      .eq("trainer_id", trainerId)
      .neq("status", "annulee")
      .is("attendance_closed_at", null)
      .gte("starts_at", new Date(now.getTime() - 7 * 86400_000).toISOString())
      .lt("ends_at", now.toISOString())
      .order("starts_at"),
  ]);

  const todaySessions = (weekSessions ?? []).filter((s) => utcToLocalDate(s.starts_at) === today);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Bonjour {firstName} 👋</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Aujourd&apos;hui ({todaySessions.length} séance{todaySessions.length > 1 ? "s" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas de séance aujourd&apos;hui.</p>
          ) : (
            <ul className="space-y-2">
              {todaySessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                  <span className="font-medium">
                    {utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}
                  </span>
                  <span>{(s.groups as unknown as { name: string } | null)?.name}</span>
                  {(s.rooms as unknown as { name: string } | null)?.name && (
                    <Badge variant="outline">{(s.rooms as unknown as { name: string }).name}</Badge>
                  )}
                  <Link
                    href={`/seances/${s.id}/emargement`}
                    className="ml-auto inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Émargement →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(toClose ?? []).length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">
              ⚠️ Feuilles d&apos;émargement à clôturer ({(toClose ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(toClose ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>
                    {new Date(s.starts_at).toLocaleDateString("fr-FR", {
                      weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris",
                    })}{" "}
                    {utcToLocalTime(s.starts_at)}
                  </span>
                  <span className="font-medium">{(s.groups as unknown as { name: string } | null)?.name}</span>
                  <Link href={`/seances/${s.id}/emargement`} className="ml-auto text-sm hover:underline">
                    Clôturer →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ma semaine ({(weekSessions ?? []).length} séances)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(weekSessions ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">
                  {new Date(s.starts_at).toLocaleDateString("fr-FR", {
                    weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris",
                  })}
                </span>
                <span className="w-28">{utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}</span>
                <span className="font-medium">{(s.groups as unknown as { name: string } | null)?.name}</span>
                {s.attendance_closed_at && <Badge variant="secondary">émargée</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link href="/planning" className="text-sm text-muted-foreground hover:underline">
              Voir le planning complet →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

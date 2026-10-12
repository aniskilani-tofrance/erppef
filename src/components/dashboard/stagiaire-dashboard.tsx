import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { utcToLocalDate, utcToLocalTime, weekStartOf, nextDay } from "@/lib/dates";
import { internGroupIds } from "@/lib/stagiaires";

// Accueil du STAGIAIRE : ses groupes et les séances de la semaine, avec l'accès direct à la
// feuille d'émargement. La RLS ne lui renvoie de toute façon que ses groupes.
export async function StagiaireDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data: profile }, groupIds] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    internGroupIds(supabase, userId),
  ]);
  const firstName = profile?.full_name?.split(/\s+/)[0] ?? "";

  if (groupIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;êtes rattaché(e) à aucun groupe pour l&apos;instant : la coordination vous ajoute
          depuis la fiche du groupe (carte « Stagiaires du groupe »).
        </p>
      </div>
    );
  }

  const today = utcToLocalDate(new Date().toISOString());
  const weekStart = weekStartOf(today);
  let weekEnd = weekStart;
  for (let i = 0; i < 7; i++) weekEnd = nextDay(weekEnd);

  const [{ data: groups }, { data: weekSessions }] = await Promise.all([
    supabase.from("groups").select("id, name, status").in("id", groupIds).order("name"),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, attendance_closed_at, groups(name), rooms:room_id(name)")
      .in("group_id", groupIds)
      .neq("status", "annulee")
      .gte("starts_at", `${weekStart}T00:00:00Z`)
      .lt("starts_at", `${weekEnd}T00:00:00Z`)
      .order("starts_at"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Bonjour {firstName} 👋</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mes groupes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(groups ?? []).map((g) => (
              <li key={g.id}>
                <Link href={`/groupes/${g.id}`} className="font-medium hover:underline">{g.name}</Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cette semaine ({(weekSessions ?? []).length} séances)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(weekSessions ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-muted-foreground">
                  {new Date(s.starts_at).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" })}
                </span>
                <span className="w-28">{utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}</span>
                <span className="font-medium">{(s.groups as unknown as { name: string } | null)?.name}</span>
                {s.attendance_closed_at ? (
                  <Badge variant="secondary">émargée</Badge>
                ) : (
                  <Link href={`/seances/${s.id}/emargement`} className="ml-auto text-muted-foreground hover:underline">
                    Émargement →
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link href="/planning" className="text-sm text-muted-foreground hover:underline">Voir le planning et les kits de séance →</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

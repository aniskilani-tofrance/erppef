import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localToUtc, nextDay, utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { loadLatestLogsByGroup } from "@/lib/seances/cahier";
import { BookOpenText, ClipboardCheck } from "lucide-react";

// « Ma journée » d'une formatrice : ses séances du jour (animées ou co-animées) avec
// l'effectif, la salle, ce qu'avait noté la séance précédente, et ses feuilles
// d'émargement à clôturer. Affiché pour tout compte relié à une fiche formateur :
// formatrice ET coordinatrice qui anime aussi des cours.
export async function MyDay({ trainerId, title = "Aujourd'hui" }: { trainerId: string; title?: string }) {
  const supabase = await createClient();
  const now = new Date();
  const today = utcToLocalDate(now.toISOString());
  const mine = `trainer_id.eq.${trainerId},co_trainer_id.eq.${trainerId}`;

  const [{ data: todaySessions }, { data: upcoming }, { data: toClose }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, group_id, starts_at, ends_at, attendance_closed_at, co_trainer_id, groups(name), rooms:room_id(name)")
      .or(mine)
      .neq("status", "annulee")
      .gte("starts_at", localToUtc(today, "00:00"))
      .lt("starts_at", localToUtc(nextDay(today), "00:00"))
      .order("starts_at"),
    // Pas de cours aujourd'hui : on annonce le prochain
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, groups(name), rooms:room_id(name)")
      .or(mine)
      .neq("status", "annulee")
      .gte("starts_at", localToUtc(nextDay(today), "00:00"))
      .order("starts_at")
      .limit(1),
    supabase
      .from("sessions")
      .select("id, starts_at, groups(name)")
      .or(mine)
      .neq("status", "annulee")
      .is("attendance_closed_at", null)
      .gte("starts_at", new Date(now.getTime() - 7 * 86400_000).toISOString())
      .lt("ends_at", now.toISOString())
      .order("starts_at"),
  ]);

  const sessions = todaySessions ?? [];
  const groupIds = [...new Set(sessions.map((s) => s.group_id))];
  const [{ data: enrollments }, lastLogs] = await Promise.all([
    groupIds.length
      ? supabase.from("enrollments").select("group_id").in("group_id", groupIds).eq("status", "inscrit")
      : Promise.resolve({ data: [] as { group_id: string }[] }),
    loadLatestLogsByGroup(supabase, groupIds, localToUtc(today, "00:00")),
  ]);
  const headcount = new Map<string, number>();
  for (const e of enrollments ?? []) headcount.set(e.group_id, (headcount.get(e.group_id) ?? 0) + 1);

  const name = (g: unknown) => (g as { name: string } | null)?.name ?? "Groupe";
  const room = (r: unknown) => (r as { name: string } | null)?.name ?? null;
  const next = upcoming?.[0];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {title} ({sessions.length} séance{sessions.length > 1 ? "s" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pas de séance aujourd&apos;hui.
              {next && (
                <>
                  {" "}Prochaine :{" "}
                  <span className="font-medium text-foreground">
                    {new Date(next.starts_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" })}{" "}
                    à {utcToLocalTime(next.starts_at)}
                  </span>{" "}
                  — {name(next.groups)}
                  {room(next.rooms) && `, ${room(next.rooms)}`}.
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((s) => {
                const log = lastLogs.get(s.group_id);
                const count = headcount.get(s.group_id) ?? 0;
                return (
                  <li key={s.id} className="space-y-2 rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}
                      </span>
                      <span>{name(s.groups)}</span>
                      {room(s.rooms) && <Badge variant="outline">{room(s.rooms)}</Badge>}
                      <span className="text-xs text-muted-foreground">{count} inscrit{count > 1 ? "s" : ""}</span>
                      {s.co_trainer_id === trainerId && <Badge variant="secondary">co-animation</Badge>}
                      {s.attendance_closed_at && <Badge variant="secondary">émargée</Badge>}
                    </div>
                    {log && (log.done || log.next) && (
                      <p className="flex gap-1.5 text-xs text-muted-foreground">
                        <BookOpenText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          La dernière fois : {log.done ?? "—"}
                          {log.next && <> · <span className="text-foreground">Prévu : {log.next}</span></>}
                        </span>
                      </p>
                    )}
                    <Link
                      href={`/seances/${s.id}/emargement`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto sm:justify-start"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      {s.attendance_closed_at ? "Feuille et cahier de séance" : "Émargement et cahier de séance"}
                    </Link>
                  </li>
                );
              })}
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
                  <span className="font-medium">{name(s.groups)}</span>
                  <Link href={`/seances/${s.id}/emargement`} className="ml-auto text-sm hover:underline">
                    Clôturer →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

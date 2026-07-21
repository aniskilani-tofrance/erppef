import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { utcToLocalTime } from "@/lib/dates";

export default async function GroupePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();
  const supabase = await createClient();

  const [{ data: group }, { data: sessions }, { data: hours }] = await Promise.all([
    supabase
      .from("groups")
      .select("*, programs(name, level), funders(name, color), trainers:trainer_id(first_name, last_name), rooms:room_id(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, trainers:trainer_id(first_name), rooms:room_id(name)")
      .eq("group_id", id)
      .order("starts_at"),
    supabase.from("v_group_hours").select("*").eq("group_id", id).single(),
  ]);

  if (!group) notFound();

  const done = hours ? Number(hours.hours_done) : 0;
  const scheduled = hours ? Number(hours.hours_scheduled) : 0;
  const total = Number(group.total_hours);
  const funder = group.funders as unknown as { name: string; color: string } | null;
  const trainer = group.trainers as unknown as { first_name: string; last_name: string } | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        {funder && (
          <Badge style={{ backgroundColor: funder.color, color: "white" }}>{funder.name}</Badge>
        )}
        <Link href="/groupes" className="ml-auto text-sm text-muted-foreground hover:underline">
          ← Tous les groupes
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispositif</p>
            <p className="mt-1 font-medium">{(group.programs as unknown as { name: string } | null)?.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Formateur</p>
            <p className="mt-1 font-medium">
              {trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : "Non affecté"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Salle</p>
            <p className="mt-1 font-medium">{(group.rooms as unknown as { name: string } | null)?.name ?? "Non réservée"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avancement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={total > 0 ? (done / total) * 100 : 0} />
          <p className="text-sm text-muted-foreground">
            {Math.round(done)} h réalisées · {Math.round(scheduled)} h planifiées · {total} h au total
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Séances ({(sessions ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Horaire</TableHead>
                  <TableHead>Formateur</TableHead>
                  <TableHead>Salle</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{formatDateTime(s.starts_at)}</TableCell>
                    <TableCell>
                      {utcToLocalTime(s.starts_at)} – {utcToLocalTime(s.ends_at)}
                    </TableCell>
                    <TableCell>{(s.trainers as unknown as { first_name: string } | null)?.first_name ?? "—"}</TableCell>
                    <TableCell>{(s.rooms as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "annulee" ? "destructive" : s.status === "realisee" ? "secondary" : "outline"}>
                        {{ planifiee: "Planifiée", realisee: "Réalisée", annulee: "Annulée" }[s.status as string]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

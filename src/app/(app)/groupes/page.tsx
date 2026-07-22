import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  en_attente: { label: "En attente", variant: "outline" },
  ouvert: { label: "Ouvert", variant: "default" },
  complet: { label: "Complet", variant: "secondary" },
  termine: { label: "Terminé", variant: "outline" },
  annule: { label: "Annulé", variant: "destructive" },
};

export default async function GroupesPage() {
  const { role } = await requireSession();
  const supabase = await createClient();

  const [{ data: groups }, { data: hours }, { data: enrollments }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, status, starts_on, ends_on, total_hours, capacity, programs(name), funders(name, color), trainers:trainer_id(first_name), rooms:room_id(name)")
      .order("starts_on", { ascending: false }),
    supabase.from("v_group_hours").select("*"),
    supabase.from("enrollments").select("group_id").eq("status", "inscrit"),
  ]);

  const canWrite = role === "admin" || role === "coordinator";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Groupes</h1>
        {canWrite && (
          <Button asChild>
            <Link href="/groupes/nouveau">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau groupe
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Dispositif</TableHead>
              <TableHead>Financeur</TableHead>
              <TableHead>Formateur</TableHead>
              <TableHead>Salle</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>Effectif</TableHead>
              <TableHead>Avancement</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(groups ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Aucun groupe. Créez le premier avec « Nouveau groupe ».
                </TableCell>
              </TableRow>
            )}
            {(groups ?? []).map((g) => {
              const h = (hours ?? []).find((x) => x.group_id === g.id);
              const done = h ? Math.round(Number(h.hours_done)) : 0;
              const enrolled = (enrollments ?? []).filter((e) => e.group_id === g.id).length;
              const status = STATUS_LABELS[g.status] ?? STATUS_LABELS.en_attente;
              const funder = g.funders as unknown as { name: string; color: string } | null;
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">
                    <Link href={`/groupes/${g.id}`} className="hover:underline">{g.name}</Link>
                  </TableCell>
                  <TableCell>{(g.programs as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>
                    {funder && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: funder.color }} />
                        {funder.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{(g.trainers as unknown as { first_name: string } | null)?.first_name ?? "—"}</TableCell>
                  <TableCell>{(g.rooms as unknown as { name: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(g.starts_on)} → {g.ends_on ? formatDate(g.ends_on) : "?"}
                  </TableCell>
                  <TableCell className={`text-sm ${g.capacity && enrolled > g.capacity ? "font-medium text-destructive" : ""}`}>
                    {enrolled}{g.capacity ? ` / ${g.capacity}` : ""}
                  </TableCell>
                  <TableCell className="text-sm">{done} / {Number(g.total_hours)} h</TableCell>
                  <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

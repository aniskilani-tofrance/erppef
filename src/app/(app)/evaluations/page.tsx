import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { KIND_LABELS, type EvaluationKind } from "@/lib/evaluations/grid";
import { STATE_LABELS, computeMilestones, milestoneState, type MilestoneSession, type MilestoneState } from "@/lib/evaluations/milestones";

// Vue d'ensemble des évaluations : pour chaque groupe en cours, les deux jalons, leur état et
// l'avancement des grilles. Les formateurs voient leurs groupes, la coordination tous.

const STATE_CLASS: Record<MilestoneState, string> = {
  sans_date: "border-gray-300 bg-gray-100 text-gray-600",
  a_venir: "border-sky-300 bg-sky-50 text-sky-800",
  bientot: "border-amber-300 bg-amber-50 text-amber-800",
  a_faire: "border-red-300 bg-red-50 text-red-700",
  en_cours: "border-violet-300 bg-violet-50 text-violet-800",
  faite: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

function fmtDate(day: string | null): string {
  return day ? new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }) : "—";
}

export default async function EvaluationsPage() {
  const { role } = await requireSession();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

  const [{ data: groups }, { data: sessions }, { data: enrollments }, { data: evals }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, midterm_on, final_on, programs(level), trainers:trainer_id(first_name, last_name)")
      .in("status", ["en_attente", "ouvert", "complet"])
      .order("starts_on"),
    supabase.from("sessions").select("group_id, starts_at, ends_at, status").neq("status", "annulee"),
    supabase.from("enrollments").select("group_id").eq("status", "inscrit"),
    supabase.from("evaluations").select("group_id, learner_id, kind, co, po, ce, pe"),
  ]);

  const rows = (groups ?? []).map((g) => {
    const gSessions = (sessions ?? []).filter((s) => s.group_id === g.id) as MilestoneSession[];
    const milestones = computeMilestones(gSessions, { midterm_on: g.midterm_on, final_on: g.final_on });
    const expected = (enrollments ?? []).filter((e) => e.group_id === g.id).length;
    const done = (kind: EvaluationKind) => (evals ?? []).filter((e) => e.group_id === g.id && e.kind === kind && (e.co || e.po || e.ce || e.pe)).length;
    const trainer = g.trainers as unknown as { first_name: string; last_name: string | null } | null;
    return {
      id: g.id,
      name: g.name,
      level: (g.programs as unknown as { level: string | null } | null)?.level ?? null,
      trainer: trainer ? `${trainer.first_name} ${trainer.last_name ?? ""}`.trim() : null,
      expected,
      jalons: (["mi_parcours", "finale"] as EvaluationKind[]).map((kind) => {
        const on = kind === "mi_parcours" ? milestones.midterm.on : milestones.final.on;
        const d = done(kind);
        return { kind, on, done: d, state: milestoneState(on, today, d, expected) };
      }),
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Évaluations</h1>
        <p className="text-sm text-muted-foreground">
          Mi-parcours et fin de parcours de chaque groupe : grille par compétence (référentiel CECRL, trois crans), test ciblé en appui, attestation d&apos;acquis en fin de parcours.
          {role === "trainer" ? " Vous voyez les groupes qui vous concernent." : ""}
        </p>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Groupe</TableHead>
              <TableHead className="hidden sm:table-cell">Formatrice</TableHead>
              <TableHead>Mi-parcours</TableHead>
              <TableHead>Finale</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucun groupe en cours.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/groupes/${r.id}/evaluations`} className="hover:underline">{r.name}</Link>
                  <span className="block text-xs font-normal text-muted-foreground">{r.level ? `niveau visé ${r.level} · ` : ""}{r.expected} inscrit{r.expected > 1 ? "s" : ""}</span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{r.trainer ?? "—"}</TableCell>
                {r.jalons.map((j) => (
                  <TableCell key={j.kind}>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm">{fmtDate(j.on)}</span>
                      <Badge variant="outline" className={`w-fit ${STATE_CLASS[j.state]}`} title={KIND_LABELS[j.kind]}>
                        {STATE_LABELS[j.state]}{r.expected ? ` · ${j.done}/${r.expected}` : ""}
                      </Badge>
                    </div>
                  </TableCell>
                ))}
                <TableCell>
                  <Link href={`/groupes/${r.id}/evaluations`} className="text-sm hover:underline">Ouvrir →</Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

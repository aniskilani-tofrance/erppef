import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvaluationGrid } from "@/components/evaluations/evaluation-grid";
import { MilestonesForm } from "@/components/evaluations/milestones-form";
import { countDone, loadGroupEvaluations } from "@/lib/evaluations/data";
import { KIND_LABELS, summarizeSkills, type EvaluationKind } from "@/lib/evaluations/grid";
import { STATE_LABELS, milestoneState, type MilestoneState } from "@/lib/evaluations/milestones";

// Évaluations de mi-parcours et finale d'un groupe : jalons, tests ciblés, grille par
// compétence (3 crans CECRL), attestation d'acquis en fin de parcours.

const STATE_CLASS: Record<MilestoneState, string> = {
  sans_date: "border-gray-300 bg-gray-100 text-gray-600",
  a_venir: "border-sky-300 bg-sky-50 text-sky-800",
  bientot: "border-amber-300 bg-amber-50 text-amber-800",
  a_faire: "border-red-300 bg-red-50 text-red-700",
  en_cours: "border-violet-300 bg-violet-50 text-violet-800",
  faite: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

function fmtDate(day: string | null): string {
  return day ? new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : "—";
}

export default async function GroupEvaluationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, userId } = await requireSession();
  const supabase = await createClient();
  const data = await loadGroupEvaluations(supabase, id);
  if (!data) notFound();

  const [{ data: profile }, h] = await Promise.all([supabase.from("profiles").select("full_name").eq("id", userId).single(), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "pef-erp.vercel.app"}`;
  const senderFirstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const today = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const canManage = role === "admin" || role === "coordinator";
  const canEdit = canManage || role === "trainer";
  const expected = data.rows.length;

  const kinds: { kind: EvaluationKind; on: string | null; auto: boolean }[] = [
    { kind: "mi_parcours", on: data.milestones.midterm.on, auto: data.milestones.midterm.auto },
    { kind: "finale", on: data.milestones.final.on, auto: data.milestones.final.auto },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href={`/groupes/${id}`} className="text-sm text-muted-foreground hover:underline">← {data.group.name}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Évaluations — {data.group.name}</h1>
        <p className="text-sm text-muted-foreground">
          Niveau visé : <b>{data.group.targetLevel ?? "—"}</b>{data.group.entryLevel ? ` (entrée ${data.group.entryLevel})` : ""} · {data.group.trainerName ?? "formatrice à affecter"} · {expected} inscrit{expected > 1 ? "s" : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Jalons</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mi-parcours à la moitié des heures planifiées, finale à la dernière séance. La formatrice est prévenue par email une semaine avant, puis la veille.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {kinds.map(({ kind, on, auto }) => {
              const done = countDone(data.rows, kind);
              const state = milestoneState(on, today, done, expected);
              return (
                <li key={kind} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{KIND_LABELS[kind]}</span>
                  <span className="text-muted-foreground">{fmtDate(on)}{auto ? "" : " (date choisie)"}</span>
                  <Badge variant="outline" className={`ml-auto ${STATE_CLASS[state]}`}>{STATE_LABELS[state]}{expected ? ` · ${done}/${expected}` : ""}</Badge>
                </li>
              );
            })}
          </ul>
          {canManage && (
            <MilestonesForm
              groupId={id}
              midtermOn={data.group.midtermOn}
              finalOn={data.group.finalOn}
              midtermAuto={data.milestones.midterm.auto ? data.milestones.midterm.on : null}
              finalAuto={data.milestones.final.auto ? data.milestones.final.on : null}
            />
          )}
        </CardContent>
      </Card>

      {kinds.map(({ kind, on }) => {
        const done = countDone(data.rows, kind);
        const state = milestoneState(on, today, done, expected);
        const summary = summarizeSkills(data.rows.map((r) => r.evals[kind] ?? {}));
        return (
          <Card key={kind} id={kind}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {KIND_LABELS[kind]}
                <Badge variant="outline" className={STATE_CLASS[state]}>{STATE_LABELS[state]}</Badge>
                <span className="text-sm font-normal text-muted-foreground">{fmtDate(on)}</span>
              </CardTitle>
              {done > 0 && (
                <p className="text-xs text-muted-foreground">
                  {summary.map((s) => `${s.label} : ${s.acquis} acquis / ${s.enCours} en cours / ${s.nonAcquis} non acquis`).join(" · ")}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <EvaluationGrid groupId={id} kind={kind} rows={data.rows} origin={origin} senderFirstName={senderFirstName} canEdit={canEdit} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

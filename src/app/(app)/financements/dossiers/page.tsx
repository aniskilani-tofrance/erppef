import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, loadTeam, requireFinancements } from "@/lib/financements/acces";
import type { Stage } from "@/lib/financements/constants";
import { ApplicationFormDialog } from "@/components/financements/application-form-dialog";
import { PipelineBoard, type PipelineCard } from "@/components/financements/pipeline-board";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// Dossiers : le pipeline, une colonne par statut. Glisser une carte change son statut
// (sur téléphone : menu « Changer de statut » sur chaque carte).
export default async function DossiersPage() {
  const { orgId, userId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data }, funders, team] = await Promise.all([
    supabase
      .from("funding_applications")
      .select("id, title, stage, owner_id, amount_requested, amount_granted, deadline_at, updated_at, funders(name, color)")
      .eq("org_id", orgId)
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    loadFundersLite(orgId),
    loadTeam(orgId),
  ]);
  const names = new Map(team.map((m) => [m.userId, m.name]));
  const cards: PipelineCard[] = (data ?? []).map((a) => {
    const f = a.funders as unknown as { name: string; color: string | null } | null;
    return {
      id: a.id,
      title: a.title,
      stage: a.stage as Stage,
      funderName: f?.name ?? "—",
      funderColor: f?.color ?? null,
      amountRequested: num(a.amount_requested),
      amountGranted: num(a.amount_granted),
      deadlineAt: a.deadline_at,
      ownerName: a.owner_id ? names.get(a.owner_id) ?? null : null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Glissez une carte d&apos;une colonne à l&apos;autre pour changer le statut du dossier ; chaque changement est gardé dans l&apos;historique de la fiche.
        </p>
        <ApplicationFormDialog funders={funders} team={team} defaultOwnerId={userId} />
      </div>
      <PipelineBoard cards={cards} />
    </div>
  );
}

import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayParis } from "@/lib/leads/queries";
import { loadProspects, frDate, type ProspectListRow } from "@/lib/prospection/queries";
import { listStats } from "@/lib/prospection/queue";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServiceClock } from "@/components/leads/service-clock";
import { ProspectImportDialog } from "@/components/prospection/import-dialog";

export const metadata = { title: "Prospection — ERP PEF" };

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)} %` : "—";
}

// Les listes d'appels à froid : combien reste-t-il à appeler aujourd'hui, et ce que chaque
// liste rapporte (joignabilité, intérêt, RDV). Les intéressés deviennent des leads.
export default async function ProspectionPage() {
  await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data: listData }, prospects] = await Promise.all([
    supabase.from("prospect_lists").select("id, name, description, created_at").is("archived_at", null).order("created_at", { ascending: false }),
    loadProspects(supabase),
  ]);
  const lists = (listData ?? []) as ProspectListRow[];
  const today = todayParis();

  const leadIds = prospects.map((p) => p.lead_id).filter((id): id is string => Boolean(id));
  const rdvLeads = new Set<string>();
  if (leadIds.length) {
    const { data } = await supabase
      .from("employer_leads")
      .select("id")
      .in("id", leadIds)
      .in("status", ["rdv_pris", "rdv_tenu", "proposition", "gagne"]);
    for (const l of data ?? []) rdvLeads.add(l.id as string);
  }

  const rows = lists.map((l) => {
    const ps = prospects.filter((p) => p.list_id === l.id);
    return { list: l, s: listStats(ps, today), rdv: ps.filter((p) => p.lead_id && rdvLeads.has(p.lead_id)).length };
  });
  const dueTotal = rows.reduce((n, r) => n + r.s.due, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospection</h1>
          <p className="text-sm text-muted-foreground">
            Appels à froid : ces restaurants n&apos;ont rien demandé. Un résultat par appel ; s&apos;il recrute, on crée le lead.
            {" "}{dueTotal} appel{dueTotal > 1 ? "s" : ""} à passer aujourd&apos;hui.
          </p>
        </div>
        <ProspectImportDialog lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
      </div>

      <ServiceClock />

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Aucune liste pour l&apos;instant. Importez un fichier Excel (copier-coller des lignes, avec les en-têtes).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Liste</TableHead>
                <TableHead className="text-right">Restaurants</TableHead>
                <TableHead className="text-right">Aujourd&apos;hui</TableHead>
                <TableHead className="hidden text-right md:table-cell">Appelés</TableHead>
                <TableHead className="hidden text-right md:table-cell" title="Quelqu'un a décroché (barrage compris), sur les appelés">Joints</TableHead>
                <TableHead className="text-right">Intéressés</TableHead>
                <TableHead className="hidden text-right md:table-cell">RDV</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ list, s, rdv }) => (
                <TableRow key={list.id}>
                  <TableCell className="max-w-[280px]">
                    <Link href={`/prospection/${list.id}`} className="font-medium hover:underline">{list.name}</Link>
                    <span className="block text-xs text-muted-foreground">Importée le {frDate(list.created_at)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{s.due}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{s.called}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{pct(s.reached, s.called)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.interested}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{rdv}</TableCell>
                  <TableCell className="text-right">
                    {s.due > 0 && (
                      <Button asChild size="sm">
                        <Link href={`/prospection/${list.id}/appels`}><PhoneCall className="mr-2 h-4 w-4" />Appeler</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinancements } from "@/lib/financements/acces";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FUNDER_KIND_LABELS, PORTAL_LABELS, type FunderKind, type Portal, type Stage } from "@/lib/financements/constants";
import { formatEuros } from "@/lib/financements/liens";
import { FunderFormDialog } from "@/components/financements/funder-form-dialog";

// Financeurs : type, portail, nombre de dossiers et montant accordé total.
export default async function FinanceursPage() {
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data: funders }, { data: apps }] = await Promise.all([
    supabase.from("funders").select("id, name, code, color, kind, portal, is_active").eq("org_id", orgId).order("name"),
    supabase.from("funding_applications").select("funder_id, stage, amount_granted").eq("org_id", orgId),
  ]);
  const stats = new Map<string, { count: number; granted: number }>();
  for (const a of apps ?? []) {
    const s = stats.get(a.funder_id) ?? { count: 0, granted: 0 };
    s.count += 1;
    if ((a.stage as Stage) === "accorde" || a.stage === "bilan_rendu") s.granted += Number(a.amount_granted ?? 0);
    stats.set(a.funder_id, s);
  }
  const rows = (funders ?? []).sort((x, y) => (stats.get(y.id)?.count ?? 0) - (stats.get(x.id)?.count ?? 0) || x.name.localeCompare(y.name, "fr"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Les financeurs de l&apos;organisation (ce sont aussi ceux du planning). Montant accordé : dossiers accordés ou bilan rendu, toutes années.</p>
        <FunderFormDialog />
      </div>

      {/* Téléphone : cartes */}
      <ul className="space-y-2 md:hidden">
        {rows.map((f) => {
          const s = stats.get(f.id);
          return (
            <li key={f.id} className="rounded-lg border bg-background p-3">
              <Link href={`/financements/financeurs/${f.id}`} className="flex items-center gap-2 font-medium hover:underline">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                {f.name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {[f.kind ? FUNDER_KIND_LABELS[f.kind as FunderKind] : null, f.portal ? PORTAL_LABELS[f.portal as Portal] : null].filter(Boolean).join(" · ") || "Fiche à compléter"}
              </p>
              <p className="mt-1 text-sm">{s?.count ?? 0} dossier{(s?.count ?? 0) > 1 ? "s" : ""} · {formatEuros(s?.granted ?? 0)} accordés</p>
            </li>
          );
        })}
      </ul>

      {/* Écran large : tableau */}
      <Card className="hidden md:block">
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Financeur</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Portail</TableHead>
                <TableHead className="text-right">Dossiers</TableHead>
                <TableHead className="text-right">Accordé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => {
                const s = stats.get(f.id);
                return (
                  <TableRow key={f.id} className={f.is_active ? undefined : "text-muted-foreground"}>
                    <TableCell>
                      <Link href={`/financements/financeurs/${f.id}`} className="flex items-center gap-2 font-medium hover:underline">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                        <span className="whitespace-normal">{f.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>{f.kind ? FUNDER_KIND_LABELS[f.kind as FunderKind] : "—"}</TableCell>
                    <TableCell className="whitespace-normal">{f.portal ? PORTAL_LABELS[f.portal as Portal] : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s?.count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuros(s?.granted ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

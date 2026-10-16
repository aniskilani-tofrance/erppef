import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PhoneCall } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayParis } from "@/lib/leads/queries";
import { segmentLabel } from "@/lib/leads/status";
import { formatPhone } from "@/lib/admission/phone";
import { frDate, loadProspects, type ProspectListRow } from "@/lib/prospection/queries";
import { callQueue, listStats } from "@/lib/prospection/queue";
import { PROSPECT_STATUSES, prospectStatusBadgeClass, prospectStatusLabel } from "@/lib/prospection/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteListButton } from "@/components/prospection/delete-list-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Liste d'appels — ERP PEF" };

// Une liste d'appels : la file du jour, les statuts, et chaque restaurant.
export default async function ProspectListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { listId } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const statut = one("statut");
  const q = one("q").trim().toLowerCase();
  const { role } = await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data: listData }, prospects] = await Promise.all([
    supabase.from("prospect_lists").select("id, name, description, created_at").eq("id", listId).maybeSingle(),
    loadProspects(supabase, { listId }),
  ]);
  if (!listData) notFound();
  const list = listData as ProspectListRow;
  const today = todayParis();
  const s = listStats(prospects, today);
  const queue = callQueue(prospects, today);
  const counts: Record<string, number> = {};
  for (const p of prospects) counts[p.status] = (counts[p.status] ?? 0) + 1;

  const shown = (statut === "aujourdhui" ? queue : prospects)
    .filter((p) => (statut && statut !== "aujourdhui" ? p.status === statut : true))
    .filter((p) =>
      q ? [p.company, p.city, p.postal_code, p.phone, p.legal_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)) : true,
    );

  return (
    <div className="space-y-5">
      <Link href="/prospection" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" />Toutes les listes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
          <p className="text-sm text-muted-foreground">
            {s.total} restaurants · {s.called} appelés · {s.interested} intéressé{s.interested > 1 ? "s" : ""} · importée le {frDate(list.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(role === "admin" || role === "coordinator") && s.called === 0 && <DeleteListButton listId={list.id} />}
          {queue.length > 0 && (
            <Button asChild>
              <Link href={`/prospection/${list.id}/appels`}><PhoneCall className="mr-2 h-4 w-4" />Lancer les appels ({queue.length})</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link href={`/prospection/${list.id}?statut=aujourdhui`}>
          <Badge variant="outline" className={cn("border-primary/40", statut === "aujourdhui" && "ring-2 ring-primary/40")}>
            À appeler aujourd&apos;hui · {queue.length}
          </Badge>
        </Link>
        {PROSPECT_STATUSES.map((st) => (
          <Link key={st.code} href={`/prospection/${list.id}?statut=${st.code}`} title={st.hint}>
            <Badge variant="outline" className={cn(prospectStatusBadgeClass(st.code), statut === st.code && "ring-2 ring-primary/40")}>
              {st.label} · {counts[st.code] ?? 0}
            </Badge>
          </Link>
        ))}
        {(statut || q) && <Link href={`/prospection/${list.id}`} className="self-center text-xs text-muted-foreground underline">Tout afficher</Link>}
      </div>
      <form className="max-w-sm">
        {statut && <input type="hidden" name="statut" value={statut} />}
        <input
          id="prospects-search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher un restaurant, une ville, un numéro…"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        />
      </form>

      {shown.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Aucun restaurant ne correspond.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead className="hidden md:table-cell">Ouvert le</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden md:table-cell">Rappel</TableHead>
                <TableHead className="hidden text-right md:table-cell">Appels</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.slice(0, 500).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[280px]">
                    <Link href={`/prospection/${list.id}/appels?id=${p.id}`} className="font-medium hover:underline">{p.company}</Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {segmentLabel(p.segment)}{p.city ? ` · ${p.city}` : ""}{p.department ? ` (${p.department})` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{p.phone ? formatPhone(p.phone) : <span className="text-muted-foreground">à trouver</span>}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{frDate(p.opened_on)}</TableCell>
                  <TableCell>
                    {p.status === "interesse" && p.lead_id ? (
                      <Link href={`/leads/${p.lead_id}`}>
                        <Badge variant="outline" className={prospectStatusBadgeClass(p.status)}>{prospectStatusLabel(p.status)}</Badge>
                      </Link>
                    ) : (
                      <Badge variant="outline" className={prospectStatusBadgeClass(p.status)}>{prospectStatusLabel(p.status)}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {p.callback_on ? (
                      <span className={cn(p.callback_on < today && "font-semibold text-red-600")}>{frDate(p.callback_on)}</span>
                    ) : "—"}
                    {p.callback_note && <span className="block max-w-[200px] truncate text-muted-foreground">{p.callback_note}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{p.attempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {shown.length > 500 && <p className="px-3 py-2 text-xs text-muted-foreground">500 premiers restaurants affichés — utilisez la recherche ou les statuts.</p>}
        </div>
      )}
    </div>
  );
}

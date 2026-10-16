import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadOwners, loadSenderFirstName, ownerName, todayParis } from "@/lib/leads/queries";
import { loadProspects, type ProspectCallRow } from "@/lib/prospection/queries";
import { callQueue } from "@/lib/prospection/queue";
import { callOutcomeLabel } from "@/lib/prospection/status";
import { ServiceClock } from "@/components/leads/service-clock";
import { CallPanel } from "@/components/prospection/call-panel";

export const metadata = { title: "Session d'appels — ERP PEF" };

// La session d'appels : un restaurant à la fois, un résultat en un tap, le suivant arrive.
// ?id= ouvre un restaurant précis ; ?passes= garde les restaurants passés pendant la session.
export default async function CallSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { listId } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const { orgId, userId } = await requireRole(["admin", "coordinator", "setter"]);
  const supabase = await createClient();
  const [{ data: list }, prospects, firstName, owners] = await Promise.all([
    supabase.from("prospect_lists").select("id, name").eq("id", listId).maybeSingle(),
    loadProspects(supabase, { listId }),
    loadSenderFirstName(supabase, userId),
    loadOwners(supabase, orgId),
  ]);
  if (!list) notFound();
  const today = todayParis();
  const passes = one("passes").split(",").filter(Boolean);
  const queue = callQueue(prospects, today);
  const remaining = queue.filter((p) => !passes.includes(p.id));
  const requested = one("id");
  const current = (requested && prospects.find((p) => p.id === requested)) || remaining[0] || null;

  const back = (
    <Link href={`/prospection/${listId}`} className="inline-flex items-center text-sm text-muted-foreground hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" />{list.name as string}
    </Link>
  );

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {back}
        <div className="rounded-md border bg-background p-6 text-center">
          <PartyPopper className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
          <p className="font-medium">Plus personne à appeler aujourd&apos;hui dans cette liste.</p>
          <p className="text-sm text-muted-foreground">
            {passes.length ? `${passes.length} restaurant${passes.length > 1 ? "s" : ""} passé${passes.length > 1 ? "s" : ""} pendant la session : ` : ""}
            {passes.length ? <Link href={`/prospection/${listId}/appels`} className="underline">les reprendre</Link> : "Les rappels et nouveaux essais reviendront dans la file les prochains jours."}
          </p>
        </div>
      </div>
    );
  }

  const { data: callData } = await supabase
    .from("prospect_calls")
    .select("id, prospect_id, at, outcome, note, by_user_id")
    .eq("prospect_id", current.id)
    .order("at", { ascending: false })
    .limit(20);
  const calls = ((callData ?? []) as ProspectCallRow[]).map((c) => ({
    id: c.id,
    when: new Date(c.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }),
    who: ownerName(owners, c.by_user_id),
    outcome: callOutcomeLabel(c.outcome),
    note: c.note,
  }));
  const position = remaining.findIndex((p) => p.id === current.id);
  const nextPasses = [...passes, current.id].join(",");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {back}
      <ServiceClock />
      <CallPanel
        key={current.id}
        prospect={current}
        calls={calls}
        listId={listId}
        today={today}
        setterFirstName={firstName}
        progress={position >= 0 ? `${position + 1} / ${remaining.length} aujourd'hui` : `${remaining.length} à appeler aujourd'hui`}
        skipHref={`/prospection/${listId}/appels?passes=${nextPasses}`}
        nextHref={`/prospection/${listId}/appels${passes.length ? `?passes=${passes.join(",")}` : ""}`}
        owners={owners}
        listName={list.name as string}
      />
    </div>
  );
}

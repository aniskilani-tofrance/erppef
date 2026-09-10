import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, loadSenderFirstName, todayBuckets, todayParis, type LeadRow } from "@/lib/leads/queries";
import { ServiceClock } from "@/components/leads/service-clock";
import { TodayBoard } from "@/components/leads/today-board";
import { Button } from "@/components/ui/button";

// Dashboard du setter : sa journée, rien d'autre — l'horloge du service, les leads à
// rappeler, les relances, les rappels de RDV. Le reste de l'ERP ne le concerne pas.
export async function SetterDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data }, firstName] = await Promise.all([
    supabase.from("employer_leads").select(LEAD_COLUMNS).order("received_at", { ascending: false }).limit(1000),
    loadSenderFirstName(supabase, userId),
  ]);
  const leads = (data ?? []) as unknown as LeadRow[];
  const b = todayBuckets(leads, todayParis());
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bonjour {firstName ?? ""}</h1>
          <p className="text-sm text-muted-foreground">Un lead « Nouveau » se rappelle avant tout le reste — mais jamais pendant le service.</p>
        </div>
        <Button asChild size="sm"><Link href="/leads">Tous les leads<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </div>
      <ServiceClock />
      <TodayBoard b={b} />
      <p className="text-xs text-muted-foreground">
        <BookOpen className="mr-1 inline h-3.5 w-3.5" />
        Le kit complet (scripts, objections, arbre de vente) est dans le dossier Drive « Kit Shahzad — Leads POEI » ; le parcours <Link href="/formation" className="underline">Formation → Commercial</Link> explique cet outil en 20 minutes.
      </p>
    </div>
  );
}

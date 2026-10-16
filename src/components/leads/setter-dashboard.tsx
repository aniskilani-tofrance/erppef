import Link from "next/link";
import { ArrowRight, BookOpen, PhoneOutgoing } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, loadSenderFirstName, todayBuckets, todayParis, type LeadRow } from "@/lib/leads/queries";
import { ServiceClock } from "@/components/leads/service-clock";
import { TodayBoard } from "@/components/leads/today-board";
import { Button } from "@/components/ui/button";
import { loadProspects } from "@/lib/prospection/queries";
import { callQueue } from "@/lib/prospection/queue";

// Dashboard du setter : sa journée, rien d'autre — l'horloge du service, les leads à
// rappeler, les relances, les rappels de RDV. Le reste de l'ERP ne le concerne pas.
export async function SetterDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data }, firstName, prospects] = await Promise.all([
    supabase.from("employer_leads").select(LEAD_COLUMNS).order("received_at", { ascending: false }).limit(1000),
    loadSenderFirstName(supabase, userId),
    loadProspects(supabase, { openOnly: true }),
  ]);
  const leads = (data ?? []) as unknown as LeadRow[];
  const today = todayParis();
  const b = todayBuckets(leads, today);
  const prospectsDue = callQueue(prospects, today).length;
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
      {prospectsDue > 0 && (
        <Link href="/prospection" className="flex items-center justify-between gap-3 rounded-md border bg-background px-4 py-3 text-sm hover:bg-muted/50">
          <span className="flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4 text-violet-600" />
            <span>
              <span className="font-medium">Prospection : {prospectsDue} appel{prospectsDue > 1 ? "s" : ""} à froid aujourd&apos;hui</span>
              <span className="block text-xs text-muted-foreground">Après les leads : eux attendent notre rappel, pas les prospects.</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}
      <p className="text-xs text-muted-foreground">
        <BookOpen className="mr-1 inline h-3.5 w-3.5" />
        Le kit complet (scripts, objections, arbre de vente) est dans le dossier Drive « Kit Shahzad — Leads POEI » ; le parcours <Link href="/formation" className="underline">Formation → Commercial</Link> explique cet outil en 20 minutes.
      </p>
    </div>
  );
}

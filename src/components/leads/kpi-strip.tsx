import type { Kpis } from "@/lib/leads/queries";
import { LEAD_OFFERS, LEAD_SEGMENTS } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

function euro(n: number): string {
  return `${n.toLocaleString("fr-FR")} €`;
}

// Les chiffres du point hebdo (playbook §8) : reçus, rappelés sous 24 h, RDV, show rate, gagnés.
export function KpiStrip({ k }: { k: Kpis }) {
  const tiles: { label: string; value: string; hint: string; tone?: string }[] = [
    { label: "Reçus 7 j / 30 j", value: `${k.received7} / ${k.received30}`, hint: "Leads arrivés" },
    {
      label: "Rappelés < 24 h",
      value: k.contactedBase ? `${k.contactedUnder24h} %` : "—",
      hint: `sur ${k.contactedBase} lead${k.contactedBase > 1 ? "s" : ""} (30 j)`,
      tone: k.contactedBase ? (k.contactedUnder24h >= 90 ? "text-emerald-700" : k.contactedUnder24h >= 70 ? "text-amber-700" : "text-red-600") : undefined,
    },
    { label: "Qualifiés", value: String(k.qualified), hint: "Besoin, contrat et décideur connus" },
    { label: "RDV pris", value: String(k.rdvTaken), hint: "Rendez-vous posés" },
    { label: "Show rate", value: k.showRate == null ? "—" : `${k.showRate} %`, hint: `${k.rdvHeld} RDV tenus`, tone: k.showRate != null && k.showRate < 70 ? "text-amber-700" : undefined },
    { label: "Gagnés", value: String(k.won), hint: "Conventions signées", tone: k.won ? "text-emerald-700" : undefined },
    { label: "Pipeline", value: euro(k.pipelineAmount), hint: "Qualifié → proposition, 4 950 € par poste" },
    { label: "Hors cible", value: String(k.outOfScope), hint: "À remonter à l'agence" },
  ];
  const offers = LEAD_OFFERS.map((o) => `${o.label} ${k.byOffer[o.code] ?? 0}`).join(" · ");
  const segments = LEAD_SEGMENTS.filter((s) => k.bySegment[s.code]).map((s) => `${s.label} ${k.bySegment[s.code]}`).join(" · ");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className={cn("text-lg font-semibold tabular-nums", t.tone)}>{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.hint}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Offres : {offers}{segments ? ` — Segments : ${segments}` : ""}</p>
    </div>
  );
}

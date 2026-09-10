import Link from "next/link";
import { AlertTriangle, BellRing, CalendarCheck, PhoneCall } from "lucide-react";
import type { TodayBuckets } from "@/lib/leads/queries";
import { leadRef } from "@/lib/leads/status";
import { formatPhone } from "@/lib/admission/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function hours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} j`;
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "";
}

// « À traiter aujourd'hui » : les nouveaux jamais rappelés (la pub promet 24 h), les relances
// dues, les SMS de rappel de la veille, les RDV du jour. Même bloc sur le dashboard du setter.
export function TodayBoard({ b }: { b: TodayBuckets }) {
  const empty = !b.nouveaux.length && !b.relances.length && !b.rappels.length && !b.rdvs.length;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className={cn(b.nouveaux.some((n) => n.hours > 24) && "border-red-300")}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="h-4 w-4 text-red-600" />
            À rappeler sous 24 h ({b.nouveaux.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {b.nouveaux.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun nouveau lead en attente. Bravo.</p>
          ) : (
            <ul className="divide-y text-sm">
              {b.nouveaux.slice(0, 12).map(({ lead, hours: h }) => (
                <li key={lead.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">{lead.company}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.contact_name ?? "contact à identifier"} · {formatPhone(lead.phone)}{lead.city ? ` · ${lead.city}` : ""}
                    </span>
                  </Link>
                  <span className={cn("shrink-0 text-xs", h > 24 ? "font-semibold text-red-600" : "text-muted-foreground")} title="Depuis la réception du lead">
                    {h > 24 && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                    {hours(h)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-amber-600" />
            Relances dues ({b.relances.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {b.relances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien en retard.</p>
          ) : (
            <ul className="divide-y text-sm">
              {b.relances.slice(0, 12).map(({ lead, action }) => (
                <li key={lead.id} className="py-1.5">
                  <Link href={`/leads/${lead.id}`} className="hover:underline">
                    <span className="font-medium">{lead.company}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{leadRef(lead.lead_no)}</span>
                  </Link>
                  <span className={cn("block text-xs", action.overdue ? "text-red-600" : "text-muted-foreground")}>
                    {action.label}{action.overdue ? ` — prévu le ${action.on.split("-").reverse().join("/")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(b.rappels.length > 0 || b.rdvs.length > 0) && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-teal-600" />
              Rendez-vous — aujourd&apos;hui ({b.rdvs.length}) · SMS de rappel à envoyer pour demain ({b.rappels.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ul className="divide-y text-sm">
              {b.rdvs.map((l) => (
                <li key={l.id} className="py-1.5">
                  <Link href={`/leads/${l.id}`} className="hover:underline"><span className="font-medium">{fmtTime(l.rdv_at)}</span> — {l.company}</Link>
                  <span className="block text-xs text-muted-foreground">{l.contact_name ?? ""} · {formatPhone(l.phone)}</span>
                </li>
              ))}
              {b.rdvs.length === 0 && <li className="py-1.5 text-xs text-muted-foreground">Pas de RDV aujourd&apos;hui.</li>}
            </ul>
            <ul className="divide-y text-sm">
              {b.rappels.map((l) => (
                <li key={l.id} className="py-1.5">
                  <Link href={`/leads/${l.id}`} className="hover:underline"><span className="font-medium">{l.company}</span> — demain {fmtTime(l.rdv_at)}</Link>
                  <span className="block text-xs text-amber-700">SMS n°3 à envoyer depuis la fiche</span>
                </li>
              ))}
              {b.rappels.length === 0 && <li className="py-1.5 text-xs text-muted-foreground">Tous les rappels de demain sont partis.</li>}
            </ul>
          </CardContent>
        </Card>
      )}
      {empty && <p className="text-sm text-muted-foreground md:col-span-2">Journée à jour. Prochaine étape : préparer les fiches (Google Maps, décideurs) et relire le kit.</p>}
    </div>
  );
}

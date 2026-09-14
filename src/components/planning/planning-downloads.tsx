import { CalendarDays, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";

// « Télécharger les plannings » depuis la page Planning : tous les groupes en un fichier,
// par financeur (coordination), par groupe. Composant serveur : un simple <details>, qui
// marche sans JavaScript et se replie tout seul sur téléphone.
export function PlanningDownloads({
  groups,
  funders,
  canManage,
}: {
  groups: { id: string; name: string }[];
  funders: { id: string; name: string }[];
  canManage: boolean;
}) {
  const item = (href: string, label: string, Icon: typeof FileText, title?: string) => (
    <a
      href={href}
      title={title}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </a>
  );
  const small = (href: string, label: string, title: string) => (
    <a href={href} title={title} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
      {label}
    </a>
  );

  return (
    <details className="group relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
        <CalendarDays className="h-4 w-4" />
        Télécharger les plannings
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="z-20 mt-2 w-full rounded-md border bg-background p-2 shadow-md sm:absolute sm:right-0 sm:w-[26rem]">
        <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tous les groupes en cours</p>
        {item("/planning/telecharger", "PDF apprenants (sommaire + chaque groupe)", FileText, "À imprimer pour l'accueil ou la rentrée")}
        {canManage && item("/planning/telecharger?pour=financeur", "PDF version financeur", FileText, "Planning prévisionnel avec durées, cumul et statut des séances")}
        <div className="flex gap-1 px-2 pb-1">
          {small("/planning/telecharger?format=csv", "CSV", "Une ligne par séance, colonne Groupe")}
          {small("/planning/telecharger?format=ics", "Calendrier .ics", "À ouvrir dans Google Agenda / Outlook")}
        </div>

        {canManage && funders.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Par financeur</p>
            {funders.map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  {item(`/rapports/financeur/${f.id}/planning`, f.name, FileText, "Sommaire + planning prévisionnel de chaque groupe de ce financeur")}
                </div>
                {small(`/rapports/financeur/${f.id}/planning?format=csv`, "CSV", "Une ligne par séance")}
                {small(`/rapports/financeur/${f.id}/planning?format=ics`, ".ics", "Calendrier")}
              </div>
            ))}
          </>
        )}

        {groups.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Par groupe</p>
            <div className="max-h-64 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    {item(`/groupes/${g.id}/planning?pour=apprenants`, g.name, FileSpreadsheet, "PDF apprenants de ce groupe")}
                  </div>
                  {canManage && small(`/groupes/${g.id}/planning?pour=financeur`, "financeur", "PDF version financeur")}
                  {small(`/groupes/${g.id}/planning?format=ics`, ".ics", "Calendrier de ce groupe")}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

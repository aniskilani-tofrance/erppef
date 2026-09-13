"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarSync, ExternalLink, ListChecks, Loader2 } from "lucide-react";
import { listGoogleCalendars, syncGoogleCalendars } from "@/app/(app)/parametres/actions";
import type { OrgCalendar } from "@/lib/gcal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABEL: Record<string, string> = { reader: "lecture", writer: "écriture", owner: "propriétaire" };

export function GcalSyncCard() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<OrgCalendar[] | null>(null);
  const [listing, setListing] = useState(false);

  function sync() {
    startTransition(async () => {
      const result = await syncGoogleCalendars();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { calendars, upserted, unchanged, deleted, renamed, shared, errors } = result.stats;
      const parts = [
        `${calendars} agenda${calendars > 1 ? "s" : ""}`,
        `${upserted} séance${upserted > 1 ? "s" : ""} poussée${upserted > 1 ? "s" : ""}`,
        `${unchanged} inchangée${unchanged > 1 ? "s" : ""}`,
        `${deleted} retirée${deleted > 1 ? "s" : ""}`,
      ];
      if (renamed) parts.push(`${renamed} agenda${renamed > 1 ? "s" : ""} renommé${renamed > 1 ? "s" : ""}`);
      if (shared) parts.push(`${shared} partage${shared > 1 ? "s" : ""} ajouté${shared > 1 ? "s" : ""}`);
      if (errors.length) parts.push(`${errors.length} erreur(s)`);
      setSummary(parts.join(" · "));
      if (errors.length) {
        toast.warning(`Synchronisé avec ${errors.length} erreur(s) : ${errors[0]}`);
      } else {
        toast.success("Agendas Google synchronisés.");
      }
      if (calendarsLoaded) void list();
    });
  }

  const calendarsLoaded = calendars !== null;

  async function list() {
    setListing(true);
    const result = await listGoogleCalendars();
    setListing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCalendars(result.calendars);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agendas Google des formateurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pousse toutes les séances à venir vers un agenda Google « Cours PEF — Formateur » par
          formateur (partagé en lecture avec l&apos;email de sa fiche) et vers l&apos;agenda
          « Cours PEF — Tous les formateurs » (toutes les séances, formatrice dans le titre).
          Tous les comptes ERP de rôle admin ont ces agendas en écriture. Les séances
          déplacées ou annulées sont mises à jour, seules celles qui ont changé sont réécrites,
          et un agenda est renommé ou repartagé si le nom, l&apos;email du formateur ou la liste
          des admins a changé. Une synchronisation automatique tourne chaque nuit ; ce bouton
          force une synchronisation immédiate.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={sync} disabled={pending}>
            <CalendarSync className="mr-2 h-4 w-4" />
            {pending ? "Synchronisation…" : "Synchroniser maintenant"}
          </Button>
          <Button variant="outline" onClick={list} disabled={listing}>
            {listing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
            {calendarsLoaded ? "Actualiser la liste" : "Voir tous les agendas"}
          </Button>
          {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
        </div>

        {calendarsLoaded && (
          calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun agenda encore créé : cliquez « Synchroniser maintenant ».
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {calendars.map((c) => (
                <li key={c.calendarId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.title}
                      {c.kind === "all" && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">direction</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.shares.length
                        ? c.shares.map((s) => `${s.email} (${ROLE_LABEL[s.role] ?? s.role})`).join(" · ")
                        : "partagé avec personne — vérifiez l'email de la fiche formateur"}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Ouvrir dans Google Agenda
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}

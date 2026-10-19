"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, ListChecks, Loader2 } from "lucide-react";
import { listMyGoogleCalendars } from "@/app/(app)/compte/actions";
import type { OrgCalendar } from "@/lib/gcal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Carte « Mes agendas Google » : chaque agenda de l'ERP partagé avec moi, et le bouton
// qui l'ajoute à mon Google Agenda (à faire une fois, connecté avec l'adresse du compte).
export function MyCalendarsCard() {
  const [loading, setLoading] = useState(false);
  const [calendars, setCalendars] = useState<OrgCalendar[] | null>(null);
  const [email, setEmail] = useState("");

  async function load() {
    setLoading(true);
    const result = await listMyGoogleCalendars();
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEmail(result.email);
    setCalendars(result.calendars);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mes agendas Google</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Les agendas de l&apos;ERP (cours, rendez-vous d&apos;admission) partagés avec vous. Un agenda
          partagé n&apos;apparaît pas tout seul dans Google Agenda : cliquez une fois sur « Ajouter à
          mon Google Agenda », connecté(e) avec l&apos;adresse de votre compte ERP.
        </p>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
          {calendars ? "Actualiser" : "Voir mes agendas"}
        </Button>
        {calendars &&
          (calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun agenda partagé avec {email || "votre adresse"} pour l&apos;instant. Le partage se fait à la
              synchronisation de nuit (ou « Synchroniser maintenant » dans les Paramètres, côté admin).
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {calendars.map((c) => (
                <li key={c.calendarId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <p className="min-w-0 flex-1 font-medium">{c.title}</p>
                  <Button asChild size="sm">
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                      Ajouter à mon Google Agenda
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}

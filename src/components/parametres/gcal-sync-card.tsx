"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarSync } from "lucide-react";
import { syncGoogleCalendars } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GcalSyncCard() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

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
        toast.success("Agendas Google des formateurs synchronisés.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agendas Google des formateurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pousse toutes les séances à venir vers un agenda Google « Cours PEF — Formateur »,
          partagé en lecture avec l&apos;email de chaque formateur (fiche formateur). Les séances
          déplacées ou annulées sont mises à jour, seules les séances qui ont changé sont réécrites,
          et l&apos;agenda est renommé ou repartagé si le nom ou l&apos;email du formateur a changé.
          Une synchronisation automatique tourne chaque nuit ; ce bouton force une synchronisation
          immédiate (utile après avoir ajouté ou corrigé l&apos;email d&apos;un formateur).
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={sync} disabled={pending}>
            <CalendarSync className="mr-2 h-4 w-4" />
            {pending ? "Synchronisation…" : "Synchroniser maintenant"}
          </Button>
          {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

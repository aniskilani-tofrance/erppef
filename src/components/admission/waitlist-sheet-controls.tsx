"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Sheet } from "lucide-react";
import { saveWaitlistSheet, syncWaitlistSheetNow } from "@/app/(app)/apprenants/admission/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type WaitlistSheetView = { url: string; syncedAt: string | null; rows: number | null; error: string | null } | null;

const when = (iso: string) =>
  `${new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} à ${new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h")}`;

// Carte « Liste d'attente » : Google Sheet relié (onglet « Liste d'attente (ERP) », réécrit
// chaque lundi matin), « Mettre à jour maintenant », relier ou changer le Sheet.
export function WaitlistSheetControls({ sheet, serviceEmail }: { sheet: WaitlistSheetView; serviceEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(sheet?.url ?? "");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error, { duration: 10000 });
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {sheet ? (
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={() => run(syncWaitlistSheetNow)} disabled={pending}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
              Mettre à jour le Google Sheet
            </Button>
            <Button variant="ghost" size="sm" className="h-8" asChild>
              <a href={sheet.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Ouvrir
              </a>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setOpen(true)} disabled={pending}>
              Changer
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(true)}>
            <Sheet className="mr-1 h-3.5 w-3.5" />
            Relier un Google Sheet
          </Button>
        )}
      </div>
      {sheet && (
        <p className={`text-xs ${sheet.error ? "text-amber-700" : "text-muted-foreground"}`}>
          {sheet.error
            ? sheet.error
            : sheet.syncedAt
              ? `Onglet « Liste d'attente (ERP) » mis à jour le ${when(sheet.syncedAt)} (${sheet.rows ?? 0} personne${(sheet.rows ?? 0) > 1 ? "s" : ""}) · chaque lundi matin.`
              : "Pas encore mis à jour : « Mettre à jour le Google Sheet »."}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Google Sheet de la liste d&apos;attente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              L&apos;ERP réécrit chaque lundi matin l&apos;onglet « Liste d&apos;attente (ERP) » de ce Google Sheet (créé s&apos;il n&apos;existe pas). Les autres onglets restent à vous : écrivez vos notes là, pas dans l&apos;onglet de l&apos;ERP. Les motifs se corrigent dans l&apos;ERP (« Noter un contact »).
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Dans Google Sheets → <b>Partager</b> → Accès général : <b>« Limité »</b> (jamais « Tous les utilisateurs disposant du lien » : noms et téléphones).
              </li>
              <li>
                Ajoutez en <b>Éditeur</b> : <span className="break-all font-mono text-xs">{serviceEmail ?? "le compte de service de l'ERP"}</span>
              </li>
              <li>Collez le lien du Google Sheet ci-dessous.</li>
            </ol>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <div className="flex flex-wrap justify-end gap-2">
              {sheet && (
                <Button variant="ghost" onClick={() => run(() => saveWaitlistSheet(""), () => { setLink(""); setOpen(false); })} disabled={pending}>
                  Délier
                </Button>
              )}
              <Button onClick={() => run(() => saveWaitlistSheet(link), () => setOpen(false))} disabled={pending || !link.trim()}>
                {pending ? "Mise à jour…" : "Enregistrer et mettre à jour"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

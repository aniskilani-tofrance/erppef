"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Radar, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { runWatchNow, saveWatchSettings } from "@/app/(app)/financements/veille-actions";
import type { WatchRun } from "@/lib/financements/veille-auto";
import { Field } from "./champs";

function runLine(r: WatchRun): string {
  const when = new Date(r.at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  if (r.error) return `${when} · ${r.focus} · interrompue : ${r.error}`;
  const added = r.added ? `${r.added} nouvelle${r.added > 1 ? "s" : ""} à trier` : "rien de nouveau";
  const rest = [r.known ? `${r.known} déjà connue${r.known > 1 ? "s" : ""}` : null, r.dropped ? `${r.dropped} écartée${r.dropped > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
  return `${when} · ${r.focus} · ${added}${rest ? ` (${rest})` : ""}${r.manual ? " · lancée à la main" : ""}`;
}

// Recherche automatique des financements : état, dernières recherches, réglages, lancement.
export function WatchCard({
  enabled, profile, runs, aiReady, nextFocus, budgetNote,
}: {
  enabled: boolean;
  profile: string;
  runs: WatchRun[];
  aiReady: boolean;
  nextFocus: string;
  budgetNote: string;
}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState(profile);
  const [saving, startSaving] = useTransition();
  const [running, startRunning] = useTransition();
  const router = useRouter();

  function save() {
    startSaving(async () => {
      const r = await saveWatchSettings({ enabled: on, profile: text });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }
  function run() {
    startRunning(async () => {
      const r = await runWatchNow();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.run.error) toast.error(`Recherche interrompue : ${r.run.error}`);
      else toast.success(r.run.added ? `${r.run.added} nouvelle${r.run.added > 1 ? "s" : ""} opportunité${r.run.added > 1 ? "s" : ""} à trier.` : "Recherche terminée : rien de nouveau.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Radar className="h-4 w-4 text-primary" />
            Recherche automatique
            <span className={enabled && aiReady ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-800" : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600"}>
              {!aiReady ? "IA non activée" : enabled ? "chaque nuit" : "en pause"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Chaque nuit, l&apos;ERP cherche sur le web des appels à projets, des fondations, du mécénat et des marchés publics qui correspondent à votre profil, vérifie les liens et dépose les nouveautés dans « À trier ». Axe du jour : {nextFocus}. {budgetNote}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={run} disabled={running || !aiReady}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            {running ? "Recherche en cours…" : "Chercher maintenant"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setOn(enabled); setText(profile); } }}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5" />Réglages</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Recherche automatique des financements</DialogTitle>
                <DialogDescription>Plus le profil est précis, plus les trouvailles sont justes.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>Chercher chaque nuit</span>
                  <Switch checked={on} onCheckedChange={setOn} disabled={saving} />
                </label>
                <Field label="Ce que nous cherchons" hint="Qui vous êtes, votre public, votre territoire (commune, département, région), vos actions, les montants utiles, et ce qui ne vous intéresse pas.">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} maxLength={3000} disabled={saving} className="text-sm leading-relaxed" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
                  <Button type="button" onClick={save} disabled={saving || text.trim().length < 20}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {running && <p className="text-xs text-muted-foreground">La recherche prend une à trois minutes. Vous pouvez rester sur cette page.</p>}
      {runs.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {runs.slice(0, 4).map((r) => <li key={r.at}>{runLine(r)}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune recherche pour l&apos;instant : la première tourne cette nuit, ou lancez-la avec « Chercher maintenant ».</p>
      )}
    </div>
  );
}

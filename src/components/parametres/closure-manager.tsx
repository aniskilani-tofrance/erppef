"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClosure, upsertClosure } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

export type OrgClosure = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

// Gère uniquement les fermetures propres à l'organisme (kind = fermeture_org).
// Les fériés et vacances scolaires sont des entrées globales non éditables ici.
export function ClosureManager({ closures }: { closures: OrgClosure[] }) {
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await upsertClosure({ label, startsOn, endsOn: endsOn || startsOn });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fermeture ajoutée : le moteur ne planifiera plus sur cette période.");
      setLabel("");
      setStartsOn("");
      setEndsOn("");
    });
  }

  function remove(c: OrgClosure) {
    startTransition(async () => {
      const result = await deleteClosure(c.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Fermeture « ${c.label} » supprimée.`, {
        action: {
          label: "Annuler",
          onClick: async () => {
            const undo = await upsertClosure({ label: c.label, startsOn: c.startsOn, endsOn: c.endsOn });
            if (undo.ok) toast.success("Fermeture rétablie.");
            else toast.error(undo.error);
          },
        },
      });
    });
  }

  return (
    <div className="space-y-4">
      {closures.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span>
                <span className="font-medium">{c.label}</span>{" "}
                <span className="text-muted-foreground">
                  {formatDate(c.startsOn)}
                  {c.endsOn !== c.startsOn ? ` → ${formatDate(c.endsOn)}` : ""}
                </span>
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(c)} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune fermeture propre à l&apos;organisme.</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>Motif</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fermeture estivale" className="w-48" />
        </div>
        <div className="space-y-2">
          <Label>Du</Label>
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-2">
          <Label>Au (inclus)</Label>
          <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="w-40" />
        </div>
        <Button onClick={add} disabled={pending || !label || !startsOn}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
    </div>
  );
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

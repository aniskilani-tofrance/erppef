"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";
import { deactivateProgram, deleteProgram } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// Suppression d'un dispositif : définitive seulement s'il n'est lié à aucun groupe ;
// sinon, point d'attention et proposition de désactivation (l'historique des séances
// émargées est un registre légal, on ne le détruit pas).
export function DeleteProgramButton({
  programId,
  name,
  groupCount,
}: {
  programId: string;
  name: string;
  groupCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Supprimer le dispositif">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer « {name} » ?</DialogTitle>
        </DialogHeader>
        {groupCount > 0 ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                <strong>{groupCount} groupe{groupCount > 1 ? "s" : ""}</strong> et leurs séances
                (émargements compris) utilisent ce dispositif. La suppression est bloquée pour
                préserver cet historique — désactivez-le : il disparaîtra des nouveaux groupes
                sans toucher à l&apos;existant.
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button
                onClick={() => run(() => deactivateProgram(programId), "Dispositif désactivé.")}
                disabled={pending}
              >
                {pending ? "…" : "Désactiver le dispositif"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ce dispositif n&apos;est utilisé par aucun groupe. La suppression est définitive.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => run(() => deleteProgram(programId), "Dispositif supprimé.")}
                disabled={pending}
              >
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

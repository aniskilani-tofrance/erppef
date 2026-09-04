"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";
import { deleteLearner } from "@/app/(app)/apprenants/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// Suppression d'un apprenant : définitive seulement s'il n'appartient (ou n'a
// appartenu) à aucun groupe — sinon l'historique d'émargement et les bilans en
// dépendent, et on explique comment faire (le retirer du groupe d'abord).
export function DeleteLearnerButton({
  learnerId,
  name,
  enrollmentCount,
}: {
  learnerId: string;
  name: string;
  enrollmentCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const enrolled = enrollmentCount > 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteLearner(learnerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} supprimé.`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={enrolled ? "Inscrit dans un groupe — non supprimable" : "Supprimer l'apprenant"}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer {name} ?</DialogTitle>
        </DialogHeader>
        {enrolled ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Cet apprenant est inscrit dans <strong>{enrollmentCount} groupe{enrollmentCount > 1 ? "s" : ""}</strong>.
                La suppression est bloquée : son historique (émargements, heures, bilans financeurs)
                doit être conservé. Pour le retirer, ouvrez la fiche du groupe et cliquez « Retirer »
                — ou marquez sa sortie de parcours (abandon / terminé) pour garder la trace.
              </span>
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sa fiche, sa photo et son éventuel test de positionnement seront définitivement
              supprimés. Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={pending}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

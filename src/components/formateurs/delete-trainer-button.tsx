"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";
import { deactivateTrainer, deleteTrainer } from "@/app/(app)/formateurs/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

// Suppression d'un formateur : définitive seulement s'il n'apparaît dans aucun groupe
// ni aucune séance ; sinon, proposition de désactivation (l'historique des heures et
// des émargements sert aux coûts et au registre légal — on ne le détruit pas).
export function DeleteTrainerButton({
  trainerId,
  name,
  sessionCount,
  groupCount,
  isActive,
}: {
  trainerId: string;
  name: string;
  sessionCount: number;
  groupCount: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const referenced = sessionCount > 0 || groupCount > 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTrainer(trainerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} supprimé.`);
      router.push("/formateurs");
      router.refresh();
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateTrainer(trainerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} désactivé : le moteur ne le proposera plus.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Supprimer le formateur">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer {name} ?</DialogTitle>
        </DialogHeader>
        {referenced ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Ce formateur est référencé par <strong>{groupCount} groupe{groupCount > 1 ? "s" : ""}</strong> et{" "}
                <strong>{sessionCount} séance{sessionCount > 1 ? "s" : ""}</strong>. La suppression est
                bloquée pour préserver l&apos;historique des heures et des émargements —
                désactivez-le : le moteur et les listes ne le proposeront plus, sans toucher au passé.
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button onClick={handleDeactivate} disabled={pending || !isActive}>
                {isActive ? (pending ? "Désactivation…" : "Désactiver") : "Déjà inactif"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sa fiche, ses disponibilités, ses absences et ses documents seront définitivement
              supprimés. Son éventuel compte ERP n&apos;est pas supprimé mais ne sera plus lié à
              une fiche formateur.
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

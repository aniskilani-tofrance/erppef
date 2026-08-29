"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyPlus } from "lucide-react";
import { duplicateGroup } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// « Reconduire le groupe » : même dispositif/formateur/salle/rythme, planning
// re-matérialisé depuis la nouvelle date (nouvelles vacances sautées).
export function DuplicateGroupDialog({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await duplicateGroup({ groupId, startsOn });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Groupe reconduit : planning généré, à vérifier puis passer en « Ouvert ».");
      setOpen(false);
      router.push(`/groupes/${result.groupId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CopyPlus className="mr-2 h-3.5 w-3.5" />
          Reconduire
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconduire « {groupName} »</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crée un nouveau groupe identique (dispositif, financeur, formateur, salle, rythme)
            avec un planning complet régénéré depuis la date choisie — vacances et fériés à
            venir automatiquement sautés. En cas de conflit de salle ou de formateur, rien
            n&apos;est créé et le conflit vous est signalé.
          </p>
          <div className="space-y-2">
            <Label htmlFor="dup-date">Date de début de la nouvelle session</Label>
            <Input
              id="dup-date"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !startsOn}>
              {pending ? "Génération…" : "Reconduire le groupe"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

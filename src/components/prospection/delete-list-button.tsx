"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteProspectList } from "@/app/(app)/prospection/actions";
import { Button } from "@/components/ui/button";

// Supprimer une liste importée par erreur — seulement tant qu'aucun appel n'y a été noté.
export function DeleteListButton({ listId }: { listId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="mr-2 h-4 w-4" />Supprimer la liste
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      Supprimer la liste et ses restaurants ?
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deleteProspectList({ listId });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Liste supprimée.");
            router.push("/prospection");
          })
        }
      >
        Supprimer
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>Annuler</Button>
    </span>
  );
}

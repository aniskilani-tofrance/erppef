"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { syncFromDrive } from "@/app/(app)/apprenants/actions";
import { Button } from "@/components/ui/button";

// Le fichier partagé Google Drive alimente la liste chaque nuit ; ce bouton
// force la synchronisation immédiatement.
export function DriveSyncButton() {
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const result = await syncFromDrive();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={pending} title="Importer les nouvelles lignes du fichier Drive partagé">
      <RefreshCw className={`mr-2 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Synchronisation…" : "Synchroniser le Drive"}
    </Button>
  );
}

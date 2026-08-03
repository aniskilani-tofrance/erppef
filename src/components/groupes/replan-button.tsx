"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { replanMissingHours } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";

export function ReplanButton({ groupId }: { groupId: string }) {
  const [pending, startTransition] = useTransition();

  function replan() {
    startTransition(async () => {
      const result = await replanMissingHours(groupId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Séances de rattrapage ajoutées à la suite du planning.");
    });
  }

  return (
    <Button size="sm" onClick={replan} disabled={pending}>
      <CalendarPlus className="mr-2 h-4 w-4" />
      {pending ? "Replanification…" : "Replanifier automatiquement"}
    </Button>
  );
}

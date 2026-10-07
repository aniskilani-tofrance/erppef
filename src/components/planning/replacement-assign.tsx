"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { assignReplacement } from "@/app/(app)/planning/remplacements/actions";
import { Button } from "@/components/ui/button";

// Bouton « Confier à … » d'une remplaçante proposée.
export function ReplacementAssignButton({
  sessionId,
  trainerId,
  label,
  primary,
}: {
  sessionId: string;
  trainerId: string;
  label: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function assign() {
    startTransition(async () => {
      const res = await assignReplacement({ sessionId, trainerId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.emailed ? `Séance confiée à ${label}, prévenue par email.` : `Séance confiée à ${label} (pas d'email sur sa fiche : prévenez-la).`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant={primary ? "default" : "outline"} onClick={assign} disabled={pending} className="h-8">
      <UserCheck className="mr-1 h-3.5 w-3.5" />
      {pending ? "…" : `Confier à ${label}`}
    </Button>
  );
}

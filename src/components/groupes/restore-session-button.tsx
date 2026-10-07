"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreSession } from "@/app/(app)/planning/actions";

// Séance annulée par erreur : elle redevient planifiée (les kits déjà décalés ne reviennent pas).
export function RestoreSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreSession(sessionId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Séance rétablie. Les kits déjà décalés restent sur leurs nouvelles séances.");
          router.refresh();
        })
      }
      className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
    >
      {pending ? "…" : "Rétablir"}
    </button>
  );
}

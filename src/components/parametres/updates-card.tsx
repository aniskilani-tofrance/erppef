"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendUpdateAnnouncements } from "@/app/(app)/parametres/actions";
import { Button } from "@/components/ui/button";

// « Envoyer maintenant » : annonce à l'équipe les mises à jour pas encore envoyées
// (sinon le cron du matin s'en charge).
export function SendUpdatesButton({ pending }: { pending: number }) {
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  function send() {
    startTransition(async () => {
      const result = await sendUpdateAnnouncements();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }
  return (
    <Button size="sm" variant={pending > 0 ? "default" : "outline"} onClick={send} disabled={busy || pending === 0} title={pending === 0 ? "Tout a déjà été annoncé" : "Envoyer l'email « Quoi de neuf » à l'équipe"}>
      <Send className="mr-1.5 h-3.5 w-3.5" />
      {busy ? "Envoi…" : pending > 0 ? `Envoyer maintenant (${pending})` : "Tout est annoncé"}
    </Button>
  );
}

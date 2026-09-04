"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { sendPendingInvitationEmails } from "@/app/(app)/apprenants/admission/actions";
import { Button } from "@/components/ui/button";

// Envoi groupé par email des convocations « à envoyer » (apprenants avec email).
// WhatsApp reste le canal principal : ce bouton sert pour ceux qui préfèrent l'email.
export function SendPendingEmailsButton({ meetingId, count }: { meetingId: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (count === 0) return null;

  function send() {
    startTransition(async () => {
      const result = await sendPendingInvitationEmails(meetingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.sent} convocation${result.sent > 1 ? "s" : ""} envoyée${result.sent > 1 ? "s" : ""} par email${result.skipped ? ` (${result.skipped} non envoyée${result.skipped > 1 ? "s" : ""})` : ""}.`);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={send} disabled={pending} title="Envoie la convocation par email à tous les convoqués « à envoyer » qui ont une adresse">
      <Mail className="mr-1.5 h-3.5 w-3.5" />
      {pending ? "Envoi…" : `Envoyer par email (${count})`}
    </Button>
  );
}

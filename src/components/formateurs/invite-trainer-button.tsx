"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MailPlus } from "lucide-react";
import { inviteTrainerAccount } from "@/app/(app)/formateurs/actions";
import { Button } from "@/components/ui/button";

export function InviteTrainerButton({
  trainerId,
  hasAccount,
}: {
  trainerId: string;
  hasAccount: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function invite() {
    startTransition(async () => {
      const result = await inviteTrainerAccount(trainerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation envoyée : le formateur va recevoir un email pour créer son mot de passe.");
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={invite} disabled={pending}>
      <MailPlus className="mr-2 h-3.5 w-3.5" />
      {pending ? "Envoi…" : hasAccount ? "Renvoyer l'invitation" : "Inviter à se connecter"}
    </Button>
  );
}

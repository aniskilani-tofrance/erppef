"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Mail, X } from "lucide-react";
import {
  removeInvitation,
  sendInvitationEmail,
  setInvitationStatus,
} from "@/app/(app)/admission/actions";
import { INVITATION_STATUSES } from "@/lib/admission/status";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Actions d'une ligne de convoqué : envoyer (WhatsApp d'abord, email sinon),
// rappeler la veille, changer le statut (confirmé, présent…), retirer.
export function InvitationActions({
  invitation,
  learner,
  messages,
  meetingUpcoming,
}: {
  invitation: { id: string; status: string };
  learner: { id: string; name: string; phone: string | null; email: string | null };
  messages: { invite: string; reminder: string };
  meetingUpcoming: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const sent = invitation.status !== "a_envoyer";

  function email() {
    startTransition(async () => {
      const result = await sendInvitationEmail(invitation.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`Convocation envoyée par email à ${learner.name}.`);
        router.refresh();
      }
    });
  }

  function changeStatus(status: string) {
    startTransition(async () => {
      const result = await setInvitationStatus({ invitationId: invitation.id, status });
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Retirer ${learner.name} de cette réunion ?`)) return;
    startTransition(async () => {
      const result = await removeInvitation(invitation.id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <WhatsAppButton
        phone={learner.phone}
        message={messages.invite}
        trace={{ kind: "invitation", invitationId: invitation.id }}
        label={sent ? "Renvoyer" : "Convoquer"}
        variant={sent ? "ghost" : "outline"}
        title={sent ? "Renvoyer la convocation sur WhatsApp" : "Envoyer la convocation sur WhatsApp (message pré-rempli)"}
      />
      {learner.email && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={email}
          disabled={pending}
          title={`Envoyer la convocation par email (${learner.email})`}
        >
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
      {sent && meetingUpcoming && (
        <WhatsAppButton
          phone={learner.phone}
          message={messages.reminder}
          trace={{ kind: "contact", learnerId: learner.id, note: "Rappel de la réunion d'information (WhatsApp)" }}
          label="Rappel"
          variant="ghost"
          title="Envoyer un rappel WhatsApp (la veille)"
        />
      )}
      <Select value={invitation.status} onValueChange={changeStatus} disabled={pending}>
        <SelectTrigger className="h-7 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVITATION_STATUSES.map((s) => (
            <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={remove} disabled={pending} title="Retirer de la réunion">
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <span className="sr-only"><BellRing className="h-3 w-3" /></span>
    </div>
  );
}

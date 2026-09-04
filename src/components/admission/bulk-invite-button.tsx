"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { inviteToMeeting } from "@/app/(app)/admission/actions";
import { useLearnerSelection } from "@/components/apprenants/learner-selection";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// « Convoquer (n) » depuis la liste des apprenants : les cases cochées → une réunion
// d'information à venir, puis on atterrit sur la réunion pour envoyer les messages.
export function BulkInviteButton({ meetings }: { meetings: { id: string; label: string }[] }) {
  const { selected, clear } = useLearnerSelection();
  const [open, setOpen] = useState(false);
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const count = selected.size;
  if (count === 0) return null;

  function submit() {
    startTransition(async () => {
      const result = await inviteToMeeting({ meetingId, learnerIds: [...selected.keys()] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.invited} convoqué${result.invited > 1 ? "s" : ""} ajouté${result.invited > 1 ? "s" : ""}.`);
      clear();
      setOpen(false);
      router.push(`/admission/${meetingId}`);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="mr-1.5 h-3.5 w-3.5" />
        Convoquer ({count})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convoquer {count} apprenant{count > 1 ? "s" : ""} à une réunion d&apos;information</DialogTitle>
          </DialogHeader>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune réunion à venir. <Link href="/admission" className="underline">Créez d&apos;abord une réunion</Link>, puis revenez cocher les apprenants.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Réunion</Label>
                <Select value={meetingId} onValueChange={setMeetingId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meetings.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Les messages WhatsApp s&apos;envoient ensuite un par un depuis la page de la réunion (message pré-rempli, vous n&apos;avez qu&apos;à appuyer sur Envoyer).
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
                <Button onClick={submit} disabled={pending || !meetingId}>{pending ? "Ajout…" : "Convoquer"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

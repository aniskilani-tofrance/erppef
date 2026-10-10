"use client";

import { draftSeatOffer } from "@/app/(app)/assistant/actions";
import { DraftMessageDialog } from "@/components/assistant/draft-message-dialog";

export function SeatOfferButton({ groupId, learner }: { groupId: string; learner: { id: string; firstName: string; phone: string | null } }) {
  return (
    <DraftMessageDialog
      title="Proposer la place"
      triggerLabel="Proposer la place"
      learner={learner}
      load={() => draftSeatOffer({ learnerId: learner.id, groupId })}
      traceNote="Place libérée proposée (message de l'assistant)"
      size="xs"
    />
  );
}

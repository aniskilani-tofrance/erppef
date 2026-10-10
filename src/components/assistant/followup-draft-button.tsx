"use client";

import { draftAbsenceFollowup } from "@/app/(app)/assistant/actions";
import { DraftMessageDialog } from "@/components/assistant/draft-message-dialog";

// Relance d'absence adaptée à l'historique (ton + langue), à relire avant envoi.
export function FollowupDraftButton({ learner }: { learner: { id: string; firstName: string; phone: string | null } }) {
  return (
    <DraftMessageDialog
      title="Relance adaptée"
      triggerLabel="Message adapté"
      learner={learner}
      load={() => draftAbsenceFollowup(learner.id)}
      traceNote="Relance absence (message adapté par l'assistant)"
    />
  );
}

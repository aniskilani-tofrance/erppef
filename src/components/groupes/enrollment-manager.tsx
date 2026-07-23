"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enrollLearner, unenrollLearner } from "@/app/(app)/apprenants/actions";
import { LearnerFormDialog } from "@/components/apprenants/learner-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserMinus } from "lucide-react";

export type Enrolled = {
  enrollmentId: string;
  learnerId: string;
  name: string;
  level: string | null;
  stats?: {
    rate: number;
    total: number;
    consecutiveAbsences: number;
  } | null;
};

// Seuil aligné sur ABSENCE_ALERT_THRESHOLD (lib/attendance-stats).
const ALERT_STREAK = 3;

// Inscriptions d'un groupe : liste des inscrits, ajout d'un apprenant existant,
// ou création + inscription en un seul geste via le dialog apprenant.
export function EnrollmentManager({
  groupId,
  groupName,
  enrolled,
  available,
}: {
  groupId: string;
  groupName: string;
  enrolled: Enrolled[];
  available: { id: string; name: string }[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await enrollLearner({ groupId, learnerId: selectedId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Apprenant inscrit.");
      setSelectedId("");
    });
  }

  function remove(e: Enrolled) {
    startTransition(async () => {
      const result = await unenrollLearner(e.enrollmentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${e.name} retiré du groupe.`, {
        action: {
          label: "Annuler",
          onClick: async () => {
            const undo = await enrollLearner({ groupId, learnerId: e.learnerId });
            if (undo.ok) toast.success(`${e.name} réinscrit.`);
            else toast.error(undo.error);
          },
        },
      });
    });
  }

  return (
    <div className="space-y-4">
      {enrolled.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {enrolled.map((e) => (
            <li key={e.enrollmentId} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span>
                <span className="font-medium">{e.name}</span>
                {e.level && <span className="ml-2 text-muted-foreground">{e.level}</span>}
                {e.stats && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {e.stats.rate} % · {e.stats.total} séance{e.stats.total > 1 ? "s" : ""}
                  </span>
                )}
                {e.stats && e.stats.consecutiveAbsences >= ALERT_STREAK && (
                  <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
                    {e.stats.consecutiveAbsences} absences de suite
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {e.stats && e.stats.total > 0 && (
                  <a
                    href={`/groupes/${groupId}/certificat/${e.learnerId}`}
                    className="text-xs text-muted-foreground hover:underline"
                    title="Certificat de réalisation (PDF)"
                  >
                    Certificat
                  </a>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(e)} disabled={pending} title="Retirer du groupe">
                  <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l&apos;instant.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Inscrire un apprenant existant…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 && (
              <SelectItem value="empty" disabled>
                Tous les apprenants sont déjà inscrits
              </SelectItem>
            )}
            {available.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={pending || !selectedId}>
          {pending ? "Inscription…" : "Inscrire"}
        </Button>
        <LearnerFormDialog
          groups={[{ id: groupId, name: groupName }]}
          defaultGroupId={groupId}
          triggerLabel="Créer et inscrire"
        />
      </div>
    </div>
  );
}

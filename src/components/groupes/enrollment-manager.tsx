"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  enrollLearner,
  unenrollLearner,
  updateEnrollmentStatus,
} from "@/app/(app)/apprenants/actions";
import { LearnerFormDialog } from "@/components/apprenants/learner-form-dialog";
import { EnrollmentPicker, type PickerLearner } from "@/components/groupes/enrollment-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export type Enrolled = {
  enrollmentId: string;
  learnerId: string;
  name: string;
  level: string | null;
  status: "inscrit" | "abandon" | "termine";
  leftOn: string | null;
  stats?: {
    rate: number;
    total: number;
    consecutiveAbsences: number;
  } | null;
};

// Seuil aligné sur ABSENCE_ALERT_THRESHOLD (lib/attendance-stats).
const ALERT_STREAK = 3;

function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

// Inscriptions d'un groupe : liste des inscrits, ajout d'un apprenant existant,
// ou création + inscription en un seul geste via le dialog apprenant.
export function EnrollmentManager({
  groupId,
  groupName,
  enrolled,
  available,
  suggestedLevel = null,
}: {
  groupId: string;
  groupName: string;
  enrolled: Enrolled[];
  available: PickerLearner[];
  suggestedLevel?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function remove(e: Enrolled) {
    startTransition(async () => {
      const result = await unenrollLearner(e.enrollmentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${e.name} retiré du groupe (inscription effacée).`, {
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

  // Sortie de parcours : statut daté, conservé dans les bilans financeurs.
  function setStatus(e: Enrolled, status: "inscrit" | "abandon" | "termine") {
    startTransition(async () => {
      const result = await updateEnrollmentStatus({
        enrollmentId: e.enrollmentId,
        status,
        leftOn: null, // date du jour côté serveur
        leaveReason: null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        status === "inscrit"
          ? `${e.name} réinscrit dans le parcours.`
          : status === "abandon"
            ? `${e.name} marqué en abandon.`
            : `Parcours de ${e.name} marqué terminé.`,
      );
    });
  }

  return (
    <div className="space-y-4">
      {enrolled.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {enrolled.map((e) => (
            <li key={e.enrollmentId} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span>
                <span className={e.status === "abandon" ? "font-medium line-through opacity-60" : "font-medium"}>{e.name}</span>
                {e.status === "abandon" && (
                  <Badge variant="destructive" className="ml-2 text-xs">Abandon{e.leftOn ? ` le ${fmtDay(e.leftOn)}` : ""}</Badge>
                )}
                {e.status === "termine" && (
                  <Badge variant="secondary" className="ml-2 text-xs">Terminé{e.leftOn ? ` le ${fmtDay(e.leftOn)}` : ""}</Badge>
                )}
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={pending} title="Gérer l'inscription">
                      <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {e.status !== "termine" && (
                      <DropdownMenuItem onClick={() => setStatus(e, "termine")}>
                        Marquer le parcours terminé
                      </DropdownMenuItem>
                    )}
                    {e.status !== "abandon" && (
                      <DropdownMenuItem onClick={() => setStatus(e, "abandon")}>
                        Marquer en abandon
                      </DropdownMenuItem>
                    )}
                    {e.status !== "inscrit" && (
                      <DropdownMenuItem onClick={() => setStatus(e, "inscrit")}>
                        Réinscrire dans le parcours
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => remove(e)}>
                      Supprimer (erreur de saisie)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l&apos;instant.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <EnrollmentPicker groupId={groupId} available={available} suggestedLevel={suggestedLevel} />
        <LearnerFormDialog
          groups={[{ id: groupId, name: groupName }]}
          defaultGroupId={groupId}
          triggerLabel="Créer et inscrire"
        />
      </div>
    </div>
  );
}

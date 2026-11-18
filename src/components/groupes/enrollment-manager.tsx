"use client";

import { useState, useTransition } from "react";
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
import { excusedShortLabel } from "@/lib/attendance-status";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LEAVE_REASONS, describeLeaveReason, type LeaveReasonCode } from "@/lib/parcours/sortie";

export type Enrolled = {
  enrollmentId: string;
  learnerId: string;
  name: string;
  level: string | null;
  status: "inscrit" | "abandon" | "termine";
  leftOn: string | null;
  leaveReason?: string | null; // motif de l'abandon (code ou « autre : précision »)
  // Trace Qualiopi : sur un abandon, « 3 absences de suite · 2 relances (…) · dernière présence… » ;
  // sur un inscrit, suggestion « passer en abandon » si injoignable après relances.
  exit?: { trace: string | null; suggestDropout: boolean; relances: number } | null;
  stats?: {
    rate: number;
    total: number;
    excused?: number; // absences justifiées (comptées dans le taux comme des absences)
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
  // Abandon : motif obligatoire (fenêtre), pré-rempli « injoignable » depuis la suggestion
  const [dropout, setDropout] = useState<Enrolled | null>(null);
  const [reason, setReason] = useState<LeaveReasonCode | null>(null);
  const [detail, setDetail] = useState("");

  function openDropout(e: Enrolled, preset: LeaveReasonCode | null = null) {
    setDropout(e);
    setReason(preset);
    setDetail("");
  }

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
  function setStatus(e: Enrolled, status: "inscrit" | "abandon" | "termine", leave: { reason: LeaveReasonCode; detail: string } | null = null) {
    startTransition(async () => {
      const result = await updateEnrollmentStatus({
        enrollmentId: e.enrollmentId,
        status,
        leftOn: null, // date du jour côté serveur
        leaveReason: leave?.reason ?? null,
        leaveDetail: leave?.detail || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDropout(null);
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
                    {e.stats.excused ? ` · ${excusedShortLabel(e.stats.excused)}` : ""}
                  </span>
                )}
                {e.stats && e.stats.consecutiveAbsences >= ALERT_STREAK && (
                  <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
                    {e.stats.consecutiveAbsences} absences de suite
                  </span>
                )}
                {e.status === "inscrit" && e.exit?.suggestDropout && (
                  <button
                    type="button"
                    className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                    onClick={() => openDropout(e, "injoignable")}
                    disabled={pending}
                    title="Absences de suite et relances sans retour : passer l'inscription en abandon, motif « Injoignable après relances »"
                  >
                    {e.exit.relances} relances sans retour : passer en abandon ?
                  </button>
                )}
                {e.status === "abandon" && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Motif : {describeLeaveReason(e.leaveReason)}
                    {e.exit?.trace ? ` · ${e.exit.trace}` : ""}
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
                      <DropdownMenuItem onClick={() => openDropout(e)}>
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

      <Dialog open={dropout !== null} onOpenChange={(o) => !o && setDropout(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abandon — {dropout?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Le motif est gardé avec la date de sortie (preuve Qualiopi des ruptures de parcours). Notez aussi au carnet ce qui a été proposé à la personne.
            </p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Motif de l'abandon">
              {LEAVE_REASONS.map((r) => (
                <label key={r.code} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 has-[:checked]:border-primary has-[:checked]:bg-muted">
                  <input type="radio" name="motif-abandon" checked={reason === r.code} onChange={() => setReason(r.code)} />
                  {r.label}
                </label>
              ))}
            </div>
            <Input
              value={detail}
              onChange={(ev) => setDetail(ev.target.value)}
              maxLength={200}
              placeholder={reason === "autre" ? "Précisez le motif (obligatoire)" : "Précision (facultatif)"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDropout(null)} disabled={pending}>Annuler</Button>
              <Button
                variant="destructive"
                disabled={pending || !reason || (reason === "autre" && !detail.trim())}
                onClick={() => dropout && reason && setStatus(dropout, "abandon", { reason, detail: detail.trim() })}
              >
                Marquer en abandon
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

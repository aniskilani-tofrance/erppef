"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadLearnerSignatures, type LearnerSignatures } from "@/app/(app)/apprenants/documents-actions";
import { membershipYearLabel, pendingKinds } from "@/lib/documents-apprenant/regles";
import { DocStatusPills } from "./doc-status";
import { MembershipPayment } from "./membership-payment";
import { SignatureButtons } from "./signature-buttons";

// Fiche apprenant → « Adhésion, contrat, règlement » : pour chaque groupe concerné (cours
// PEF, ateliers), l'état des 3 documents (PDF signé à ouvrir), la cotisation de l'année et
// les boutons pour faire signer. Rien pour les cours municipaux.
export function LearnerSignaturesCard({ learnerId, learnerName }: { learnerId: string; learnerName: string }) {
  const [data, setData] = useState<LearnerSignatures | null>(null);
  const refresh = useCallback(() => loadLearnerSignatures(learnerId).then(setData), [learnerId]);

  useEffect(() => {
    let cancelled = false;
    loadLearnerSignatures(learnerId).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-sm font-medium">
        Adhésion, contrat, règlement <span className="font-normal text-muted-foreground">(cours PEF et ateliers)</span>
      </p>
      {!data ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
        </p>
      ) : !data.ok ? (
        <p className="text-xs text-destructive">{data.error}</p>
      ) : !data.available ? (
        <p className="text-xs text-amber-700">Fonction pas encore activée sur la base : la migration 0059 est à appliquer.</p>
      ) : !data.groups.length ? (
        <p className="text-xs text-muted-foreground">Pas de document à signer : la personne n&apos;est inscrite dans aucun cours PEF ni atelier (les cours municipaux ont leur propre cadre).</p>
      ) : (
        <div className="space-y-3">
          {data.groups.map((g) => {
            const membership = data.memberships.find((m) => m.year === g.year) ?? null;
            const todo = pendingKinds(g.states).length > 0;
            return (
              <div key={g.groupId} className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {g.groupName} · année d&apos;adhésion {membershipYearLabel(g.year)}
                </p>
                <DocStatusPills states={g.states} learnerId={learnerId} download={data.perms.download} />
                <div className="flex flex-wrap items-center gap-2">
                  {todo && (
                    <SignatureButtons
                      learnerId={learnerId}
                      groupId={g.groupId}
                      learnerName={learnerName}
                      canSignHere={data.perms.signHere}
                      canSendLink={data.perms.sendLink}
                    />
                  )}
                  {data.perms.recordPayment && (
                    <MembershipPayment learnerId={learnerId} learnerName={learnerName} year={g.year} membership={membership} onChanged={refresh} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

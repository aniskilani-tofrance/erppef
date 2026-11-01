"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  groupDocumentsOverview,
  membershipYearLabel,
  pendingKinds,
  type DocsPermissions,
  type LearnerDocsLine,
} from "@/lib/documents-apprenant/regles";
import { DocStatusPills } from "./doc-status";
import { MembershipPayment } from "./membership-payment";
import { SignatureButtons } from "./signature-buttons";

export type GroupDocsRow = LearnerDocsLine;

// Fiche groupe (cours PEF, ateliers) : pour chaque inscrit, adhésion / contrat / règlement
// (signé le JJ/MM ou à signer) et cotisation de l'année. Vue « qui n'a pas encore signé /
// pas payé » en un coup d'œil, boutons pour faire signer sur la tablette ou par WhatsApp.
export function GroupDocumentsCard({
  groupId,
  year,
  rows,
  perms,
  available,
}: {
  groupId: string;
  year: number;
  rows: GroupDocsRow[];
  perms: DocsPermissions;
  available: boolean;
}) {
  const [onlyTodo, setOnlyTodo] = useState(false);
  if (!available) {
    return <p className="text-sm text-amber-700">Fonction pas encore activée sur la base : la migration 0059 (documents de l&apos;apprenant) est à appliquer.</p>;
  }
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l&apos;instant.</p>;

  const o = groupDocumentsOverview(rows);
  const shown = onlyTodo ? rows.filter((r) => pendingKinds(r.states).length > 0 || (perms.recordPayment && !r.membership?.paid)) : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className={o.unsigned.length ? "font-medium text-amber-800" : "text-emerald-700"}>
          {o.unsigned.length ? `${o.unsigned.length} / ${o.total} n'ont pas tout signé` : "Tout le monde a signé ✓"}
        </span>
        {perms.recordPayment && (
          <span className={o.unpaid.length ? "font-medium text-amber-800" : "text-emerald-700"}>
            {o.unpaid.length ? `${o.unpaid.length} cotisation${o.unpaid.length > 1 ? "s" : ""} ${membershipYearLabel(year)} non payée${o.unpaid.length > 1 ? "s" : ""}` : `Cotisations ${membershipYearLabel(year)} : toutes payées ✓`}
          </span>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-muted-foreground">
          <Checkbox checked={onlyTodo} onCheckedChange={(c) => setOnlyTodo(c === true)} />
          Seulement ce qui reste à faire
        </label>
      </div>
      {o.unsigned.length > 0 && (
        <p className="text-xs text-muted-foreground">
          À signer : {o.unsigned.map((l) => l.name).join(", ")}.
          {perms.recordPayment && o.unpaid.length > 0 ? ` Non payé : ${o.unpaid.map((l) => l.name).join(", ")}.` : ""}
        </p>
      )}
      <ul className="divide-y rounded-md border text-sm">
        {shown.map((r) => {
          const todo = pendingKinds(r.states).length > 0;
          return (
            <li key={r.learnerId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-40 font-medium">{r.name}</span>
              <DocStatusPills states={r.states} learnerId={r.learnerId} download={perms.download} />
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                {todo && (
                  <SignatureButtons learnerId={r.learnerId} groupId={groupId} learnerName={r.name} canSignHere={perms.signHere} canSendLink={perms.sendLink} size="xs" />
                )}
                {perms.recordPayment && <MembershipPayment learnerId={r.learnerId} learnerName={r.name} year={year} membership={r.membership} size="xs" />}
              </span>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-2 text-muted-foreground">Rien à faire : tout est signé et payé.</li>}
      </ul>
    </div>
  );
}

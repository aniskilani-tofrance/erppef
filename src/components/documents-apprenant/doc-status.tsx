import { FileDown } from "lucide-react";
import { DOCUMENT_LABELS, SIGNED_DOCUMENT_KINDS, stateLabel, type DocState, type SignedDocumentKind } from "@/lib/documents-apprenant/regles";
import { cn } from "@/lib/utils";

const SHORT: Record<SignedDocumentKind, string> = {
  adhesion: "Adhésion",
  contrat_formation: "Contrat",
  reglement_interieur: "Règlement",
};

// Trois pastilles : adhésion, contrat, règlement — vert « signé le JJ/MM », ambre « à signer ».
// Avec `learnerId` + `download`, une pastille signée ouvre le PDF du dossier (coordination).
export function DocStatusPills({
  states,
  learnerId,
  download = false,
}: {
  states: Record<SignedDocumentKind, DocState>;
  learnerId?: string;
  download?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {SIGNED_DOCUMENT_KINDS.map((k) => {
        const s = states[k];
        const signed = s.state === "signe";
        const cls = cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
          signed ? "border-emerald-300 bg-emerald-50 text-emerald-800" : s.state === "ancienne_version" ? "border-orange-300 bg-orange-50 text-orange-800" : "border-amber-300 bg-amber-50 text-amber-800",
        );
        const label = (
          <>
            <span className="font-medium">{SHORT[k]}</span> {stateLabel(s)}
          </>
        );
        return download && learnerId && s.docId ? (
          <a key={k} className={cn(cls, "hover:underline")} href={`/apprenants/${learnerId}/documents-signes/${s.docId}`} target="_blank" rel="noreferrer" title={`${DOCUMENT_LABELS[k]} (PDF signé)`}>
            {label}
            <FileDown className="h-3 w-3" />
          </a>
        ) : (
          <span key={k} className={cls} title={DOCUMENT_LABELS[k]}>
            {label}
          </span>
        );
      })}
    </span>
  );
}

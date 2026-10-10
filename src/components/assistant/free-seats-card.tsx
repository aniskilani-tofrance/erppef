import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdmissionBadge } from "@/components/admission/admission-badge";
import { SeatOfferButton } from "@/components/assistant/seat-offer-button";

export type SeatCandidateRow = { id: string; firstName: string; name: string; ref: string; level: string | null; status: string; phone: string | null };

// Places libérées dans le groupe → candidats compatibles (liste d'attente / évalués, bon
// niveau, pas de chevauchement d'horaires) et proposition rédigée par l'assistant.
export function FreeSeatsCard({ groupId, free, candidates, aiEnabled }: { groupId: string; free: number; candidates: SeatCandidateRow[]; aiEnabled: boolean }) {
  if (free <= 0 || candidates.length === 0) return null;
  return (
    <Card className="border-emerald-300 bg-emerald-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{free} place{free > 1 ? "s" : ""} libre{free > 1 ? "s" : ""} — {candidates.length} candidat{candidates.length > 1 ? "s" : ""} compatible{candidates.length > 1 ? "s" : ""}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Liste d&apos;attente et évalués au niveau du groupe, sans cours au même créneau. « Proposer la place » rédige le message dans la langue de la personne ; l&apos;inscription se fait ensuite dans « Inscrire des apprenants… ».
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{c.ref}</span>
              {c.level && <span className="text-xs text-muted-foreground">{c.level}</span>}
              <AdmissionBadge status={c.status} />
              <span className="ml-auto">
                {aiEnabled ? (
                  <SeatOfferButton groupId={groupId} learner={{ id: c.id, firstName: c.firstName, phone: c.phone }} />
                ) : (
                  <Link href={`/apprenants?q=${encodeURIComponent(c.ref)}`} className="text-xs hover:underline">Voir la fiche</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

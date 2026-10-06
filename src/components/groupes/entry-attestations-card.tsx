"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Mail } from "lucide-react";
import { sendEntryAttestations } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";

export type EntryAttestationRow = {
  learnerId: string;
  name: string;
  entryOn: string; // AAAA-MM-JJ
  hasEmail: boolean;
  sentOn: string | null; // date d'envoi par email, si déjà envoyée
};

const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

// « Attestations d'entrée en formation » : tous les apprenants ayant au moins une présence
// émargée. PDF à imprimer (une page par personne), envoi par email à ceux qui ont une adresse.
export function EntryAttestationsCard({ groupId, rows, canWrite }: { groupId: string; rows: EntryAttestationRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toSend = rows.filter((r) => r.hasEmail && !r.sentOn).length;
  const href = `/groupes/${groupId}/attestations-entree`;

  const send = () =>
    start(async () => {
      const res = await sendEntryAttestations(groupId);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune attestation pour l&apos;instant : elle apparaît dès qu&apos;un apprenant est présent sur une feuille d&apos;émargement clôturée.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={href}>
            <Download className="mr-1 h-4 w-4" />
            PDF à imprimer ({rows.length})
          </a>
        </Button>
        {canWrite && (
          <Button size="sm" onClick={send} disabled={pending}>
            <Mail className="mr-1 h-4 w-4" />
            {pending ? "Envoi…" : toSend ? `Envoyer par email (${toSend}) et classer` : "Classer les copies dans les dossiers"}
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((r) => (
          <li key={r.learnerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="font-medium">{r.name}</span>
            <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>entrée le {day(r.entryOn)}</span>
              <span className={r.sentOn ? "text-emerald-700" : r.hasEmail ? "" : "text-amber-700"}>
                {r.sentOn ? `envoyée le ${day(r.sentOn)}` : r.hasEmail ? "à envoyer" : "pas d'email : à remettre imprimée"}
              </span>
              <a className="underline" href={`${href}?apprenant=${r.learnerId}`}>
                PDF
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

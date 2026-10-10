"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, Phone } from "lucide-react";
import { logAbsenceFollowup } from "@/app/(app)/dashboard/actions";
import { toWhatsAppNumber, formatPhone } from "@/lib/admission/phone";
import { buildAbsenceFollowupMessage, type AbsenceFollowup } from "@/lib/absences/followup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowupDraftButton } from "@/components/assistant/followup-draft-button";

// « Absents à relancer » : un clic ouvre WhatsApp avec le message prêt (à relire), un
// autre note un appel. Dans les deux cas la relance est tracée dans le carnet de
// contact et la personne sort de la liste.
export function AbsenceFollowupsCard({ items, senderFirstName, aiEnabled = false }: { items: AbsenceFollowup[]; senderFirstName: string | null; aiEnabled?: boolean }) {
  if (!items.length) return null;
  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Absents à relancer ({items.length})</CardTitle>
        <p className="text-xs text-muted-foreground">
          Absent(e) à sa dernière séance émargée, sans contact noté depuis. Une fois relancé(e), la personne sort de la liste ;
          elle y revient si elle manque encore un cours.{aiEnabled && " « Message adapté » : l'assistant écrit une relance selon l'historique (première absence ou série), dans sa langue, à relire avant d'envoyer."}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((f) => (
            <FollowupRow key={f.learnerId} f={f} senderFirstName={senderFirstName} aiEnabled={aiEnabled} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FollowupRow({ f, senderFirstName, aiEnabled }: { f: AbsenceFollowup; senderFirstName: string | null; aiEnabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const number = toWhatsAppNumber(f.phone);
  const missedDay = new Date(f.missedAt).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" });
  const note = `Relance absence (${f.groupName}, ${missedDay}${f.streak > 1 ? `, ${f.streak} absences de suite` : ""})`;

  function log(channel: "whatsapp" | "telephone") {
    startTransition(async () => {
      const res = await logAbsenceFollowup({ learnerId: f.learnerId, channel, note });
      if (!res.ok) toast.error(res.error);
      else {
        if (channel === "telephone") toast.success(`Appel à ${f.firstName} noté dans son carnet.`);
        router.refresh();
      }
    });
  }

  function whatsapp() {
    if (!number) return;
    const text = buildAbsenceFollowupMessage({ firstName: f.firstName, senderFirstName, missedAt: f.missedAt, streak: f.streak, nextSession: f.nextSession });
    // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    log("whatsapp");
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="font-medium">{f.firstName} {f.lastName}</span>
      <span className="text-muted-foreground">{f.groupName} · absent(e) {missedDay}</span>
      {f.streak > 1 && <Badge variant="destructive">{f.streak} absences de suite</Badge>}
      <span className="ml-auto flex items-center gap-1.5">
        {f.phone && <span className="hidden text-xs text-muted-foreground sm:inline">{formatPhone(f.phone)}</span>}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-emerald-700 hover:text-emerald-800"
          onClick={whatsapp}
          disabled={!number || pending}
          title={number ? "Écrire sur WhatsApp (message pré-rempli, à relire)" : "Pas de numéro exploitable"}
        >
          <MessageCircle className="mr-1 h-3.5 w-3.5" />
          WhatsApp
        </Button>
        {aiEnabled && number && <FollowupDraftButton learner={{ id: f.learnerId, firstName: f.firstName, phone: f.phone }} />}
        <Button size="sm" variant="ghost" className="h-8" onClick={() => log("telephone")} disabled={pending} title="J'ai appelé (ou vu la personne) : noter et retirer de la liste">
          <Phone className="mr-1 h-3.5 w-3.5" />
          Appelé(e)
        </Button>
      </span>
    </li>
  );
}

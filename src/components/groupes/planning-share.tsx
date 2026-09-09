"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { emailGroupPlanning } from "@/app/(app)/groupes/actions";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { Button } from "@/components/ui/button";

export type PlanningRecipient = { learnerId: string; name: string; phone: string | null; email: string | null; message: string };

// « Diffuser le planning » : PDF pour les apprenants et pour le financeur, CSV, calendrier
// .ics, WhatsApp par inscrit (message pré-rempli avec horaires, dates, lieu), email groupé
// avec le PDF en pièce jointe.
export function PlanningShare({ groupId, recipients, canWrite }: { groupId: string; recipients: PlanningRecipient[]; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const withEmail = recipients.filter((r) => r.email).length;

  function sendEmails() {
    startTransition(async () => {
      const result = await emailGroupPlanning(groupId);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(result.message);
        router.refresh();
      }
    });
  }

  const link = (href: string, label: string, Icon: typeof FileText, title: string) => (
    <a href={href} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted" title={title}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </a>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {link(`/groupes/${groupId}/planning?pour=apprenants`, "PDF apprenants", FileText, "Planning lisible à imprimer ou à envoyer aux apprenants")}
        {link(`/groupes/${groupId}/planning?pour=financeur`, "PDF financeur", FileText, "Planning prévisionnel avec durées, cumul et statut des séances, mentions légales")}
        {link(`/groupes/${groupId}/planning?pour=financeur&format=csv`, "CSV", FileSpreadsheet, "Tableur : une ligne par séance")}
        {link(`/groupes/${groupId}/planning?format=ics`, "Calendrier .ics", CalendarDays, "À ouvrir sur un téléphone ou dans Google Agenda / Outlook : toutes les séances s'ajoutent")}
        {canWrite && (
          <Button variant="outline" size="sm" onClick={sendEmails} disabled={pending || withEmail === 0} title={withEmail ? `Envoie le message et le PDF apprenants à ${withEmail} inscrit${withEmail > 1 ? "s" : ""} avec email` : "Aucun inscrit n'a d'adresse email"}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            {pending ? "Envoi…" : `Email + PDF aux inscrits (${withEmail})`}
          </Button>
        )}
      </div>
      {canWrite && recipients.length > 0 && (
        <ul className="divide-y rounded-md border">
          {recipients.map((r) => (
            <li key={r.learnerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span>
                {r.name}
                <span className="ml-2 text-xs text-muted-foreground">{r.phone ?? "sans téléphone"}{r.email ? ` · ${r.email}` : ""}</span>
              </span>
              <WhatsAppButton phone={r.phone} message={r.message} trace={{ kind: "contact", learnerId: r.learnerId, note: "Planning du groupe envoyé (WhatsApp)" }} label="Planning WhatsApp" title="Envoyer le planning sur WhatsApp (horaires, dates, lieu pré-remplis)" />
            </li>
          ))}
        </ul>
      )}
      {canWrite && recipients.length === 0 && (
        <p className="text-xs text-muted-foreground">Dès qu&apos;un apprenant est inscrit, son bouton WhatsApp « Planning » apparaît ici.</p>
      )}
    </div>
  );
}

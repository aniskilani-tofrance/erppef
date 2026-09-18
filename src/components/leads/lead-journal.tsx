"use client";

import { Mail, MessageSquare, Phone, CalendarClock, StickyNote, ArrowRightLeft, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { JournalMessage } from "@/lib/leads/journal";
import { cn } from "@/lib/utils";

// Le journal raconte l'histoire de la fiche. Un conseiller doit pouvoir, en le
// survolant, lire le message exact reçu par le restaurateur, sans quitter la page
// ni ouvrir Brevo ou Twilio.

export type LigneJournal = {
  id: string;
  quand: string;
  auteur: string | null;
  genre: string; // kind brut
  genreLabel: string;
  resultatLabel: string | null;
  note: string | null;
  message: JournalMessage | null;
};

const ICONES = {
  email: Mail,
  sms: MessageSquare,
  appel: Phone,
  rdv: CalendarClock,
  statut: ArrowRightLeft,
  note: StickyNote,
} as const;

function couleur(ligne: LigneJournal): string {
  if (ligne.message?.canal === "email") return "border-l-sky-500";
  if (ligne.message?.canal === "sms") return "border-l-emerald-500";
  if (ligne.genre === "appel") return "border-l-amber-500";
  if (ligne.genre === "rdv") return "border-l-violet-500";
  if (ligne.genre === "statut") return "border-l-slate-400";
  return "border-l-muted";
}

function Icone({ ligne }: { ligne: LigneJournal }) {
  const Composant =
    ligne.message?.canal === "email" ? ICONES.email
    : ligne.message?.canal === "sms" ? ICONES.sms
    : ligne.genre === "appel" ? ICONES.appel
    : ligne.genre === "rdv" ? ICONES.rdv
    : ligne.genre === "statut" ? ICONES.statut
    : ICONES.note;
  return <Composant className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function Apercu({ message }: { message: JournalMessage }) {
  return (
    <div className="max-w-sm space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {message.canal === "email" ? "E-mail au restaurateur" : "SMS au restaurateur"}
      </p>
      {message.sujet && <p className="text-xs font-medium">{message.sujet}</p>}
      <p className="whitespace-pre-line text-xs leading-relaxed">{message.corps}</p>
      <p className="text-[10px] italic opacity-70">
        Aperçu reconstitué avec les informations actuelles de la fiche.
      </p>
    </div>
  );
}

export function LeadJournal({ lignes }: { lignes: LigneJournal[] }) {
  const envoyes = lignes.filter((l) => l.message?.etat === "envoye").length;
  const programmes = lignes.filter((l) => l.message?.etat === "programme").length;

  if (lignes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune trace. Le premier appel s&apos;écrit ici.</p>;
  }

  return (
    <TooltipProvider delayDuration={120}>
      {(envoyes > 0 || programmes > 0) && (
        <p className="mb-2 text-xs text-muted-foreground">
          {envoyes > 0 && <>{envoyes} message{envoyes > 1 ? "s" : ""} envoyé{envoyes > 1 ? "s" : ""} au restaurateur</>}
          {envoyes > 0 && programmes > 0 && " · "}
          {programmes > 0 && <>{programmes} rappel{programmes > 1 ? "s" : ""} programmé{programmes > 1 ? "s" : ""}</>}
          {" · survolez une ligne pour lire le message"}
        </p>
      )}
      <ul className="max-h-[70vh] space-y-2 overflow-y-auto text-sm">
        {lignes.map((ligne) => {
          const contenu = (
            <li className={cn("border-l-2 pl-3", couleur(ligne), ligne.message && "cursor-help")}>
              <p className="text-xs text-muted-foreground">
                {ligne.quand} · {ligne.auteur ?? (ligne.message ? "automatique" : "—")}
              </p>
              <p className="flex items-start gap-1.5">
                <Icone ligne={ligne} />
                <span>
                  <span className="font-medium">
                    {ligne.message
                      ? `${ligne.message.canal === "email" ? "E-mail" : "SMS"} ${ligne.message.etat === "programme" ? "programmé" : "envoyé"}`
                      : ligne.genreLabel}
                  </span>
                  {ligne.message ? (
                    <span className="text-muted-foreground"> · {ligne.message.titre}</span>
                  ) : (
                    ligne.resultatLabel && <span className="text-muted-foreground"> · {ligne.resultatLabel}</span>
                  )}
                </span>
              </p>
              {ligne.message?.etat === "programme" && ligne.message.quand && (
                <p className="flex items-center gap-1 pl-5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  part le {ligne.message.quand}
                </p>
              )}
              {!ligne.message && ligne.note && <p className="text-xs text-muted-foreground">{ligne.note}</p>}
            </li>
          );

          if (!ligne.message) return <div key={ligne.id}>{contenu}</div>;
          return (
            <Tooltip key={ligne.id}>
              <TooltipTrigger asChild>{contenu}</TooltipTrigger>
              <TooltipContent side="left" className="max-w-sm">
                <Apercu message={ligne.message} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}

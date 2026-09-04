"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { logContact, markInvitationSent } from "@/app/(app)/apprenants/admission/actions";
import { toWhatsAppNumber } from "@/lib/admission/phone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Bouton « écrire sur WhatsApp » : ouvre WhatsApp (application ou WhatsApp Web) avec
// le message pré-rempli — la personne connectée relit, adapte si besoin, et appuie sur
// Envoyer. Aucune API : zéro coût, zéro compte à créer. Une fois WhatsApp ouvert, le
// contact est tracé (journal, statut d'admission, convocation « envoyée »).

export type WhatsAppTrace =
  | { kind: "contact"; learnerId: string; note?: string }
  | { kind: "invitation"; invitationId: string }
  | { kind: "none" };

export function WhatsAppButton({
  phone,
  message,
  trace = { kind: "none" },
  label = "WhatsApp",
  iconOnly = false,
  size = "sm",
  variant = "outline",
  className,
  title,
}: {
  phone: string | null | undefined;
  // Texte du message, ou fonction évaluée au clic (ex. lien qui dépend de window.location)
  message: string | (() => string);
  trace?: WhatsAppTrace;
  label?: string;
  iconOnly?: boolean;
  size?: "sm" | "icon" | "default";
  variant?: "outline" | "ghost" | "default" | "secondary";
  className?: string;
  title?: string;
}) {
  const number = toWhatsAppNumber(phone);
  const url = Boolean(number);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    if (!number) return;
    const text = typeof message === "function" ? message() : message;
    // Ouverture synchrone dans le clic (sinon les navigateurs bloquent la fenêtre)
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    if (trace.kind === "none") return;
    startTransition(async () => {
      const result =
        trace.kind === "contact"
          ? await logContact({
              learnerId: trace.learnerId,
              channel: "whatsapp",
              outcome: "message_envoye",
              note: trace.note ?? null,
              status: null,
            })
          : await markInvitationSent({ invitationId: trace.invitationId, channel: "whatsapp" });
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  const disabledTitle = phone?.trim() ? "Numéro de téléphone inexploitable pour WhatsApp" : "Pas de numéro de téléphone";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={open}
      disabled={!url || pending}
      title={url ? (title ?? `Écrire sur WhatsApp (message pré-rempli)`) : disabledTitle}
      className={cn(iconOnly ? "h-7 w-7" : "h-7 px-2 text-xs", url && "text-emerald-700 hover:text-emerald-800", className)}
      aria-label={label}
    >
      <MessageCircle className={cn("h-3.5 w-3.5", !iconOnly && "mr-1")} />
      {!iconOnly && label}
    </Button>
  );
}

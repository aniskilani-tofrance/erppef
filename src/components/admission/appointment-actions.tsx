"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, UserX, X } from "lucide-react";
import { setAdmissionAppointmentStatus } from "@/app/(app)/apprenants/admission/actions";
import { AppointmentDialog, type AppointmentView } from "@/components/admission/appointment-dialog";
import { dayLabel, timeOf } from "@/lib/admission/appointments";
import { Button } from "@/components/ui/button";

// Boutons d'une ligne de la carte « Rendez-vous d'admission à venir » : résultat
// (honoré / absent), déplacer (dialogue RDV), annuler. Gros boutons : usage au téléphone.
export function AppointmentActions({
  appointment,
  learnerId,
  learnerName,
}: {
  appointment: AppointmentView;
  learnerId: string;
  learnerName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function mark(status: "honore" | "absent" | "annule") {
    if (status === "annule" && !window.confirm(`Annuler le rendez-vous de ${learnerName} du ${dayLabel(appointment.startsAt)} à ${timeOf(appointment.startsAt)} ?`)) return;
    startTransition(async () => {
      const result = await setAdmissionAppointmentStatus({ id: appointment.id, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        status === "honore" ? "RDV honoré — noté au journal." : status === "absent" ? "Absence notée au journal." : "RDV annulé — retiré de Google Agenda.",
      );
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button variant="outline" size="sm" className="h-8 px-2 text-xs text-emerald-700" disabled={pending} onClick={() => mark("honore")}>
        <Check className="mr-1 h-3.5 w-3.5" />
        Honoré
      </Button>
      <Button variant="outline" size="sm" className="h-8 px-2 text-xs text-red-700" disabled={pending} onClick={() => mark("absent")}>
        <UserX className="mr-1 h-3.5 w-3.5" />
        Absent
      </Button>
      <AppointmentDialog learnerId={learnerId} learnerName={learnerName} appointment={appointment} triggerLabel="Déplacer" />
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" disabled={pending} onClick={() => mark("annule")}>
        <X className="mr-1 h-3.5 w-3.5" />
        Annuler
      </Button>
    </span>
  );
}

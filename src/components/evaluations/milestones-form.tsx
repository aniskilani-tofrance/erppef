"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMilestones } from "@/app/(app)/groupes/[id]/evaluations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Dates des jalons : automatiques (moitié des heures, dernière séance) ou choisies.
export function MilestonesForm({
  groupId,
  midtermOn,
  finalOn,
  midtermAuto,
  finalAuto,
}: {
  groupId: string;
  midtermOn: string | null; // valeur enregistrée (null = auto)
  finalOn: string | null;
  midtermAuto: string | null; // valeur calculée
  finalAuto: string | null;
}) {
  const router = useRouter();
  const [mid, setMid] = useState(midtermOn ?? "");
  const [fin, setFin] = useState(finalOn ?? "");
  const [pending, start] = useTransition();
  const dirty = (mid || null) !== midtermOn || (fin || null) !== finalOn;

  function save() {
    start(async () => {
      const result = await updateMilestones({ groupId, midtermOn: mid || null, finalOn: fin || null });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Jalons enregistrés.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <div className="space-y-1">
        <Label htmlFor="midterm-on">Mi-parcours</Label>
        <Input id="midterm-on" type="date" value={mid} onChange={(e) => setMid(e.target.value)} className="h-8 w-40" />
        <p className="text-xs text-muted-foreground">vide = automatique{midtermAuto ? ` (${midtermAuto.split("-").reverse().join("/")})` : ""}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="final-on">Finale</Label>
        <Input id="final-on" type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-8 w-40" />
        <p className="text-xs text-muted-foreground">vide = automatique{finalAuto ? ` (${finalAuto.split("-").reverse().join("/")})` : ""}</p>
      </div>
      <Button size="sm" onClick={save} disabled={pending || !dirty} className="mb-5">
        {pending ? "Enregistrement…" : "Enregistrer les dates"}
      </Button>
    </div>
  );
}

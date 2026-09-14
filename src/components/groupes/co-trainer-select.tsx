"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setGroupCoTrainer } from "@/app/(app)/groupes/actions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const NONE = "none";

// Co-animation par défaut du groupe (stagiaire ou second formateur) : s'applique aux séances
// à venir ; chaque séance reste modifiable dans le planning.
export function CoTrainerSelect({
  groupId,
  value,
  trainers,
}: {
  groupId: string;
  value: string | null;
  trainers: { id: string; name: string; contractType: string }[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? NONE);
  const [pending, start] = useTransition();

  function change(v: string) {
    setCurrent(v);
    start(async () => {
      const result = await setGroupCoTrainer({ groupId, coTrainerId: v === NONE ? null : v });
      if (!result.ok) {
        toast.error(result.error);
        setCurrent(value ?? NONE);
        return;
      }
      toast.success(v === NONE ? "Co-animation retirée des séances à venir." : `Co-animation appliquée à ${result.sessions} séance${result.sessions > 1 ? "s" : ""} à venir.`);
      router.refresh();
    });
  }

  return (
    <Select value={current} onValueChange={change} disabled={pending}>
      <SelectTrigger className="mt-1 h-8 w-full text-sm" title="Stagiaire ou second formateur présent sur les séances à venir">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Personne</SelectItem>
        {trainers.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}{t.contractType === "stagiaire" ? " (stagiaire)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

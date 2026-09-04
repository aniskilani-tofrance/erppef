"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ADMISSION_STATUSES } from "@/lib/admission/status";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Filtre de la liste des apprenants par statut d'admission (?statut=…), avec les effectifs.
export function AdmissionFilter({ value, counts }: { value: string; counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  function change(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "tous") next.delete("statut");
    else next.set("statut", v);
    const qs = next.toString();
    router.push(qs ? `/apprenants?${qs}` : "/apprenants");
  }

  return (
    <Select value={value || "tous"} onValueChange={change}>
      <SelectTrigger className="h-8 w-[210px] text-xs" title="Filtrer par statut d'admission">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tous">Tous les statuts ({total})</SelectItem>
        {ADMISSION_STATUSES.map((s) => (
          <SelectItem key={s.code} value={s.code}>
            {s.label} ({counts[s.code] ?? 0})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

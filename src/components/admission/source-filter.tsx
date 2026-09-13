"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { allSourceStyles } from "@/lib/admission/sources";
import { SourceChip } from "@/components/admission/source-dot";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Filtre de la liste des apprenants par provenance (?source=…), avec la légende des
// couleurs et les effectifs. Se combine avec le filtre par statut d'admission.
export function SourceFilter({ value, counts }: { value: string; counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  function change(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "toutes") next.delete("source");
    else next.set("source", v);
    const qs = next.toString();
    router.push(qs ? `/apprenants?${qs}` : "/apprenants");
  }

  return (
    <Select value={value || "toutes"} onValueChange={change}>
      <SelectTrigger className="h-8 w-[220px] text-xs" title="Filtrer par provenance (« Nous a contactés par »)">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="toutes">Toutes les provenances ({total})</SelectItem>
        {allSourceStyles().map((s) => (
          <SelectItem key={s.code} value={s.code}>
            <SourceChip code={s.code === "nc" ? null : s.code} />
            <span className="ml-1 text-muted-foreground">({counts[s.code] ?? 0})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

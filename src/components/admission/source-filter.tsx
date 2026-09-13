"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FAMILIES, FAMILY_ORDER, allSourceStyles } from "@/lib/admission/sources";
import { FamilyDot, SourceChip } from "@/components/admission/source-dot";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Filtre de la liste des apprenants par provenance (?source=…) : d'abord les familles
// (f:quartier, f:direct, f:prescripteur, f:nc), puis le détail par canal. Sert aussi de
// légende des couleurs. Se combine avec le filtre par statut d'admission.
export function SourceFilter({
  value,
  familyCounts,
  channelCounts,
}: {
  value: string;
  familyCounts: Record<string, number>;
  channelCounts: Record<string, number>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const total = Object.values(familyCounts).reduce((a, b) => a + b, 0);

  function change(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "toutes") next.delete("source");
    else next.set("source", v);
    const qs = next.toString();
    router.push(qs ? `/apprenants?${qs}` : "/apprenants");
  }

  return (
    <Select value={value || "toutes"} onValueChange={change}>
      <SelectTrigger className="h-8 w-[240px] text-xs" title="Filtrer par provenance (famille ou canal)">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="toutes">Toutes les provenances ({total})</SelectItem>
        <SelectGroup>
          <SelectLabel>Par famille</SelectLabel>
          {FAMILY_ORDER.map((family) => (
            <SelectItem key={family} value={`f:${family}`}>
              <span className="inline-flex items-center gap-1.5">
                <FamilyDot family={family} />
                <span className={FAMILIES[family].hollow ? "text-muted-foreground" : "font-medium"}>{FAMILIES[family].label}</span>
              </span>
              <span className="ml-1 text-muted-foreground">({familyCounts[family] ?? 0})</span>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Par canal</SelectLabel>
          {allSourceStyles()
            .filter((s) => s.code !== "nc")
            .map((s) => (
              <SelectItem key={s.code} value={s.code}>
                <SourceChip code={s.code} />
                <span className="ml-1 text-muted-foreground">({channelCounts[s.code] ?? 0})</span>
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

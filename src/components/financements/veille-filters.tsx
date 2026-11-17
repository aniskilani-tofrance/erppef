"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FAMILIES, FAMILY_LABELS, WATCH_STATUSES, WATCH_STATUS_LABELS } from "@/lib/financements/constants";
import { DEADLINE_FILTERS, DEADLINE_FILTER_LABELS } from "@/lib/financements/echeances";
import type { FunderLite } from "@/lib/financements/acces";

// Filtres de la veille (dans l'URL : partageables, le « retour » du navigateur les garde).
export function VeilleFilters({ funders }: { funders: FunderLite[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "tous") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `/financements/veille?${qs}` : "/financements/veille");
  }

  const cls = "h-8 w-full text-xs sm:w-[170px]";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Select value={params.get("famille") ?? "tous"} onValueChange={(v) => setParam("famille", v)}>
        <SelectTrigger className={cls} aria-label="Famille"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Toutes les familles</SelectItem>
          {FAMILIES.map((f) => <SelectItem key={f} value={f}>{FAMILY_LABELS[f]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("statut") ?? "tous"} onValueChange={(v) => setParam("statut", v)}>
        <SelectTrigger className={cls} aria-label="Statut"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">En veille (hors écartées)</SelectItem>
          <SelectItem value="toutes">Toutes, écartées comprises</SelectItem>
          {WATCH_STATUSES.map((s) => <SelectItem key={s} value={s}>{WATCH_STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("financeur") ?? "tous"} onValueChange={(v) => setParam("financeur", v)}>
        <SelectTrigger className={cls} aria-label="Financeur"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les financeurs</SelectItem>
          {funders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("echeance") ?? "tous"} onValueChange={(v) => setParam("echeance", v)}>
        <SelectTrigger className={cls} aria-label="Échéance"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Toutes les échéances</SelectItem>
          {DEADLINE_FILTERS.map((d) => <SelectItem key={d} value={d}>{DEADLINE_FILTER_LABELS[d]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

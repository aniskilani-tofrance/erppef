"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { LEAD_SCORES, LEAD_SEGMENTS, LEAD_STATUSES } from "@/lib/leads/status";
import type { Owner } from "@/lib/leads/queries";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Filtres de la liste (dans l'URL : partageables, et le « retour » du navigateur les garde).
export function LeadsFilter({ owners, counts }: { owners: Owner[]; counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "tous") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `/leads?${qs}` : "/leads");
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q.trim());
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input id="leads-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Restaurant, contact, ville, téléphone…" className="h-8 w-[240px] pl-8 text-xs" />
      </form>
      <Select value={params.get("statut") ?? "tous"} onValueChange={(v) => setParam("statut", v)}>
        <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les statuts ({total})</SelectItem>
          <SelectItem value="actifs">En cours (hors gagné / perdu / hors cible)</SelectItem>
          {LEAD_STATUSES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label} ({counts[s.code] ?? 0})</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("score") ?? "tous"} onValueChange={(v) => setParam("score", v)}>
        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous scores</SelectItem>
          {LEAD_SCORES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("segment") ?? "tous"} onValueChange={(v) => setParam("segment", v)}>
        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous segments</SelectItem>
          {LEAD_SEGMENTS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("suivi") ?? "tous"} onValueChange={(v) => setParam("suivi", v)}>
        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Suivi par tous</SelectItem>
          {owners.map((o) => <SelectItem key={o.userId} value={o.userId}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

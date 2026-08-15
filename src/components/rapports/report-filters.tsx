"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Funder = { id: string; name: string; color: string };

// Presets de période usuels des bilans : trimestre, année civile, année de formation (sept → août).
function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  const qFrom = `${y}-${pad(q * 3 + 1)}-01`;
  const qToMonth = q * 3 + 3;
  const qTo = `${y}-${pad(qToMonth)}-${pad(new Date(y, qToMonth, 0).getDate())}`;
  const schoolStart = now.getMonth() >= 8 ? y : y - 1;
  return [
    { label: "Année civile", from: `${y}-01-01`, to: `${y}-12-31` },
    { label: "Trimestre en cours", from: qFrom, to: qTo },
    { label: `Année de formation ${schoolStart}-${schoolStart + 1}`, from: `${schoolStart}-09-01`, to: `${schoolStart + 1}-08-31` },
  ];
}

export function ReportFilters({
  funders,
  funderId,
  from,
  to,
}: {
  funders: Funder[];
  funderId: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function apply(patch: { funder?: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
    }
    router.push(`/rapports?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Financeur</p>
        <Select value={funderId ?? ""} onValueChange={(v) => apply({ funder: v })}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Choisir un financeur" />
          </SelectTrigger>
          <SelectContent>
            {funders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                  {f.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Du</p>
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => e.target.value && apply({ from: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Au (inclus)</p>
        <Input
          type="date"
          className="w-40"
          value={to}
          onChange={(e) => e.target.value && apply({ to: e.target.value })}
        />
      </div>
      <div className="flex gap-1">
        {presets().map((p) => (
          <Button
            key={p.label}
            variant={from === p.from && to === p.to ? "secondary" : "ghost"}
            size="sm"
            onClick={() => apply({ from: p.from, to: p.to })}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FunderLite } from "@/lib/financements/acces";

// Petits éléments de formulaire partagés par les dialogues du module.

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const NONE = "__aucun__";
export const OTHER = "__autre__";

export function OptionSelect<T extends string>({
  value, onChange, options, labels, placeholder, allowNone, noneLabel = "—", ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly T[];
  labels: Record<T, string>;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value || (allowNone ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => <SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function FunderSelect({
  value, onChange, funders, allowOther, allowNone, ariaLabel = "Financeur",
}: {
  value: string;
  onChange: (v: string) => void;
  funders: FunderLite[];
  allowOther?: boolean;
  allowNone?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Select value={value || (allowNone ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}><SelectValue placeholder="Choisir le financeur" /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>—</SelectItem>}
        {allowOther && <SelectItem value={OTHER}>Autre (pas encore dans la liste)…</SelectItem>}
        {funders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

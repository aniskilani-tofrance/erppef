"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveApplicationStage } from "@/app/(app)/financements/actions";
import { STAGE_LABELS, type Stage } from "@/lib/financements/constants";
import { STAGE_TRANSITIONS } from "@/lib/financements/stages";

// Menu « Changer de statut » : sur téléphone (à la place du glisser-déposer) et sur la fiche.
// Avec `withComment`, un mot facultatif est demandé avant de valider (il va dans l'historique).
export function StageMenu({
  id, stage, withComment = false, onMoved, size = "sm",
}: {
  id: string;
  stage: Stage;
  withComment?: boolean;
  onMoved?: (to: Stage) => void;
  size?: "sm" | "xs";
}) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Stage | null>(null);
  const [comment, setComment] = useState("");
  const router = useRouter();

  function move(to: Stage, note?: string) {
    startTransition(async () => {
      const r = await moveApplicationStage({ id, to, comment: note ?? null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${STAGE_LABELS[to]}.`);
      setTarget(null);
      setComment("");
      onMoved?.(to);
      router.refresh();
    });
  }

  if (target) {
    return (
      <form
        className="flex w-full flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          move(target, comment);
        }}
      >
        <span className="text-sm">→ {STAGE_LABELS[target]}</span>
        <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Un mot pour l'historique (facultatif)" className="h-8 min-w-0 flex-1 text-sm" maxLength={500} autoFocus />
        <Button type="submit" size="sm" disabled={pending}>Valider</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setTarget(null)} disabled={pending}>Annuler</Button>
      </form>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size={size} variant="outline" disabled={pending} aria-label="Changer de statut">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Changer de statut
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Passer à…</DropdownMenuLabel>
        {STAGE_TRANSITIONS[stage].map((to) => (
          <DropdownMenuItem key={to} onSelect={() => (withComment ? setTarget(to) : move(to))}>
            {STAGE_LABELS[to]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

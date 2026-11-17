"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, GripVertical, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveApplicationStage } from "@/app/(app)/financements/actions";
import { STAGE_CLASSES, STAGE_LABELS, type Stage } from "@/lib/financements/constants";
import { canMoveStage, moveError, PIPELINE_COLUMNS } from "@/lib/financements/stages";
import { formatDueAt, formatEuros } from "@/lib/financements/liens";
import { StageMenu } from "./stage-menu";

export type PipelineCard = {
  id: string;
  title: string;
  stage: Stage;
  funderName: string;
  funderColor: string | null;
  amountRequested: number | null;
  amountGranted: number | null;
  deadlineAt: string | null;
  ownerName: string | null;
};

// Pipeline des dossiers : une colonne par statut, cartes glissées d'une colonne à l'autre
// (souris ou clavier). Sur téléphone, les colonnes s'empilent et chaque carte a son menu
// « Changer de statut ». La base historise chaque changement.
export function PipelineBoard({ cards: initial }: { cards: PipelineCard[] }) {
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<Stage | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => setCards(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const id = String(e.active.id);
    const to = e.over?.id as Stage | undefined;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || card.stage === to) return;
    const err = moveError(card.stage, to);
    if (err) {
      toast.error(err);
      return;
    }
    const from = card.stage;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: to } : c)));
    startTransition(async () => {
      const r = await moveApplicationStage({ id, to });
      if (!r.ok) {
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage: from } : c)));
        toast.error(r.error);
        return;
      }
      toast.success(`« ${card.title} » : ${STAGE_LABELS[to]}.`);
      router.refresh();
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(cards.find((c) => c.id === String(e.active.id))?.stage ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-2">
        {PIPELINE_COLUMNS.map((stage) => (
          <Column key={stage} stage={stage} cards={cards.filter((c) => c.stage === stage)} draggingFrom={dragging} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ stage, cards, draggingFrom }: { stage: Stage; cards: PipelineCard[]; draggingFrom: Stage | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const allowed = draggingFrom !== null && canMoveStage(draggingFrom, stage);
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABELS[stage]}
      className={cn(
        "flex min-h-24 flex-col gap-2 rounded-lg border bg-muted/40 p-2 md:w-64 md:shrink-0",
        allowed && "border-dashed border-primary/60",
        isOver && allowed && "bg-primary/5",
        draggingFrom !== null && !allowed && draggingFrom !== stage && "opacity-50",
      )}
    >
      <header className="flex items-center justify-between px-1">
        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", STAGE_CLASSES[stage])}>{STAGE_LABELS[stage]}</span>
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </header>
      {cards.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Aucun dossier.</p>}
      {cards.map((c) => <Card key={c.id} card={c} />)}
    </section>
  );
}

function Card({ card }: { card: PipelineCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn("rounded-md border bg-background p-3 shadow-sm", isDragging && "z-10 shadow-lg ring-2 ring-primary/40")}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 hidden cursor-grab touch-none text-muted-foreground hover:text-foreground md:block"
          aria-label={`Déplacer « ${card.title} »`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link href={`/financements/dossiers/${card.id}`} className="block text-sm font-medium leading-snug hover:underline">
            {card.title}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: card.funderColor ?? "#94a3b8" }} />
            <span className="truncate">{card.funderName}</span>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="font-medium">
              {card.amountGranted !== null ? `${formatEuros(card.amountGranted)} accordés` : card.amountRequested !== null ? `${formatEuros(card.amountRequested)} demandés` : "Montant à préciser"}
            </span>
            {card.deadlineAt && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarClock className="h-3 w-3" />
                {formatDueAt(card.deadlineAt, false)}
              </span>
            )}
            {card.ownerName && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <User className="h-3 w-3" />
                {card.ownerName}
              </span>
            )}
          </div>
          <div className="md:hidden">
            <StageMenu id={card.id} stage={card.stage} size="xs" />
          </div>
        </div>
      </div>
    </article>
  );
}

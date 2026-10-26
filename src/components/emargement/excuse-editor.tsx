"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXCUSE_REASON_MAX } from "@/lib/attendance-status";

// Couleur des boutons « Excusé » / « Excuser » : bleu, jamais le rouge de l'absence.
export const EXCUSE_BUTTON_CLASS = "border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800";

// Motif facultatif d'une absence excusée : une ligne, « Valider » (ou Entrée) enregistre.
// Partagé par la feuille d'émargement et la carte « Absents à relancer ».
export function ExcuseEditor({
  initialReason = "",
  pending,
  onSave,
  onCancel,
}: {
  initialReason?: string;
  pending: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initialReason);
  return (
    <form
      className="mt-2 flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(reason.trim());
      }}
    >
      <Input
        autoFocus
        value={reason}
        maxLength={EXCUSE_REASON_MAX}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motif (facultatif) : rendez-vous médical, préfecture, enfant malade…"
        aria-label="Motif de l'absence (facultatif)"
        className="h-8 min-w-48 flex-1 text-sm"
      />
      <Button type="submit" size="sm" variant="outline" className={EXCUSE_BUTTON_CLASS} disabled={pending}>
        {pending ? "…" : "Valider « Excusé »"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
        Annuler
      </Button>
    </form>
  );
}

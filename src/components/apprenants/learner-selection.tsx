"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteLearners } from "@/app/(app)/apprenants/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Sélection multiple d'apprenants pour la suppression en lot. La liste est rendue
// côté serveur : ce contexte client porte juste l'état des cases (id → nom).
// Seuls les apprenants sans inscription sont cochables — même règle que la
// suppression unitaire, re-vérifiée par le serveur.

type Selected = { id: string; name: string };

type SelectionContextValue = {
  selected: Map<string, string>;
  toggle: (row: Selected, on: boolean) => void;
  setMany: (rows: Selected[], on: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection hors de LearnerSelectionProvider");
  return ctx;
}

export function LearnerSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  const toggle = useCallback((row: Selected, on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(row.id, row.name);
      else next.delete(row.id);
      return next;
    });
  }, []);

  const setMany = useCallback((rows: Selected[], on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (on) next.set(r.id, r.name);
        else next.delete(r.id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const value = useMemo(() => ({ selected, toggle, setMany, clear }), [selected, toggle, setMany, clear]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

// Case d'une ligne. Désactivée (avec explication) si l'apprenant est inscrit.
export function LearnerSelectCheckbox({
  id,
  name,
  enrollmentCount,
}: {
  id: string;
  name: string;
  enrollmentCount: number;
}) {
  const { selected, toggle } = useSelection();
  const enrolled = enrollmentCount > 0;
  return (
    <Checkbox
      checked={selected.has(id)}
      disabled={enrolled}
      onCheckedChange={(v) => toggle({ id, name }, v === true)}
      aria-label={`Sélectionner ${name}`}
      title={enrolled ? "Inscrit dans un groupe — non supprimable" : `Sélectionner ${name}`}
    />
  );
}

// Case d'en-tête : coche / décoche tous les apprenants cochables affichés.
export function LearnerSelectAllCheckbox({ rows }: { rows: Selected[] }) {
  const { selected, setMany } = useSelection();
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = rows.some((r) => selected.has(r.id));
  return (
    <Checkbox
      checked={allOn ? true : someOn ? "indeterminate" : false}
      disabled={rows.length === 0}
      onCheckedChange={(v) => setMany(rows, v === true)}
      aria-label="Sélectionner tous les apprenants sans groupe"
      title={
        rows.length === 0
          ? "Aucun apprenant sans groupe à sélectionner"
          : `Sélectionner les ${rows.length} apprenant${rows.length > 1 ? "s" : ""} sans groupe`
      }
    />
  );
}

// Bouton « Supprimer la sélection » : n'apparaît qu'avec au moins une case cochée.
export function BulkDeleteLearnersButton() {
  const { selected, clear } = useSelection();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = selected.size;
  if (count === 0) return null;

  const names = [...selected.values()].sort((a, b) => a.localeCompare(b, "fr"));

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteLearners([...selected.keys()]);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.deleted > 0) {
        toast.success(`${result.deleted} apprenant${result.deleted > 1 ? "s" : ""} supprimé${result.deleted > 1 ? "s" : ""}.`);
      }
      if (result.blocked.length > 0) {
        toast.warning(
          `Non supprimé${result.blocked.length > 1 ? "s" : ""} (inscrit${result.blocked.length > 1 ? "s" : ""} ou émargement) : ${result.blocked.join(", ")}`,
          { duration: 8000 },
        );
      }
      clear();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        Supprimer ({count})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Supprimer {count} apprenant{count > 1 ? "s" : ""} ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ul className="max-h-48 overflow-y-auto rounded-md border px-3 py-2 text-sm">
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Fiches, photos et tests de positionnement seront définitivement supprimés. Cette
              action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={pending}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

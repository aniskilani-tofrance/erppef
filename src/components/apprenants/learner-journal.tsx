"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Loader2, MessageCircle, StickyNote } from "lucide-react";
import { addLearnerNote, listLearnerJournal } from "@/app/(app)/apprenants/admission/actions";
import { buildJournal, type JournalContactRow, type JournalMilestones } from "@/lib/admission/journal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Fil « Notes et échanges » de la fiche : le journal d'admission complet (contacts,
// notes internes) et les repères de la fiche (entretien d'entrée, entretien oral).
// Une note ajoutée ici est aussitôt visible dans le carnet de l'onglet Admission.

function fmt(iso: string, dayOnly: boolean): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    ...(dayOnly ? {} : { timeStyle: "short" }),
    timeZone: "Europe/Paris",
  });
}

const ICON = { note: StickyNote, contact: MessageCircle, repere: Flag } as const;

export function LearnerJournal({ learnerId, milestones }: { learnerId: string; milestones: JournalMilestones }) {
  const [rows, setRows] = useState<JournalContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const refresh = useCallback(async () => {
    const result = await listLearnerJournal(learnerId);
    if (!result.ok) toast.error(result.error);
    else setRows(result.rows);
    setLoading(false);
  }, [learnerId]);

  // Chargement à l'ouverture de la fiche ; ignoré si la fiche se ferme entre-temps.
  useEffect(() => {
    let cancelled = false;
    listLearnerJournal(learnerId).then((result) => {
      if (cancelled) return;
      if (!result.ok) toast.error(result.error);
      else setRows(result.rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  const entries = useMemo(() => buildJournal(rows, milestones), [rows, milestones]);

  function save() {
    const text = note.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addLearnerNote({ learnerId, note: text });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Note ajoutée au journal.");
      setNote("");
      await refresh();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Préfère les cours du matin ; dossier CAF en cours ; rappeler jeudi après 17h…"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Datée et signée, visible aussi dans le carnet de l&apos;onglet Admission.</p>
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={pending || !note.trim()}>
          {pending ? "Ajout…" : "Ajouter la note"}
        </Button>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du journal…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun échange ni note pour l&apos;instant.</p>
      ) : (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
          {entries.map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={e.id} className={`px-3 py-1.5 ${e.kind === "note" ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{fmt(e.at, e.dayOnly)}</span>
                  <span>· {e.title}</span>
                  {e.by && <span className="text-muted-foreground">— {e.by}</span>}
                </span>
                {e.text && <span className="block whitespace-pre-line pl-5 text-xs text-muted-foreground">{e.text}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

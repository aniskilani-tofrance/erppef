"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addAbsence, deleteAbsence } from "@/app/(app)/formateurs/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

type Absence = {
  id: string;
  startsOn: string;
  endsOn: string;
  kind: "conge" | "maladie" | "formation" | "autre";
  note: string | null;
};

const KIND_LABELS: Record<Absence["kind"], string> = {
  conge: "Congé",
  maladie: "Maladie",
  formation: "Formation",
  autre: "Autre",
};

export function AbsenceManager({ trainerId, absences }: { trainerId: string; absences: Absence[] }) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [kind, setKind] = useState<Absence["kind"]>("conge");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!startsOn || !endsOn) {
      toast.error("Renseignez les deux dates.");
      return;
    }
    startTransition(async () => {
      const result = await addAbsence({ trainerId, startsOn, endsOn, kind, note: null });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Absence enregistrée.");
      setStartsOn("");
      setEndsOn("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteAbsence(id, trainerId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Du</p>
          <Input type="date" className="w-40" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Au (inclus)</p>
          <Input type="date" className="w-40" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as Absence["kind"])}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={submit} disabled={pending}>
          Ajouter
        </Button>
      </div>

      {absences.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune absence enregistrée.</p>
      ) : (
        <ul className="space-y-2">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
              <Badge variant="outline">{KIND_LABELS[a.kind]}</Badge>
              <span>
                {formatDate(a.startsOn)} → {formatDate(a.endsOn)}
              </span>
              {a.note && <span className="text-muted-foreground">{a.note}</span>}
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => remove(a.id)} disabled={pending}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

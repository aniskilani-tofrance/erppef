"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addGroupIntern, removeGroupIntern } from "@/app/(app)/groupes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type InternOption = { userId: string; name: string };

// Coordination : rattache des comptes « Stagiaire » à ce groupe. Le stagiaire ne voit que
// les groupes où il figure ici (fiche, planning, émargement, kits, documents du groupe).
export function GroupInternsCard({ groupId, interns, candidates }: { groupId: string; interns: InternOption[]; candidates: InternOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState("");
  const available = candidates.filter((c) => !interns.some((i) => i.userId === c.userId));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    start(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setChoice("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Stagiaires du groupe</CardTitle>
        <p className="text-sm text-muted-foreground">
          Accès limité à ce groupe : fiche, planning, émargement, kits de séance et documents administratifs (attestations,
          certificats, assiduité, feuilles d&apos;émargement). Jamais les dossiers scannés, les tests ni les évaluations.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {interns.length === 0 ? (
          <p className="text-muted-foreground">Aucun stagiaire rattaché.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {interns.map((i) => (
              <li key={i.userId} className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                {i.name}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`Retirer ${i.name}`}
                  disabled={pending}
                  onClick={() => run(() => removeGroupIntern({ groupId, userId: i.userId }), `${i.name} n'a plus accès à ce groupe.`)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choisir un stagiaire" />
              </SelectTrigger>
              <SelectContent>
                {available.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={pending || !choice}
              onClick={() => run(() => addGroupIntern({ groupId, userId: choice }), "Stagiaire rattaché au groupe.")}
            >
              Ajouter
            </Button>
          </div>
        ) : (
          candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Pour ajouter un stagiaire, invitez-le d&apos;abord avec le rôle « Stagiaire » (Paramètres → Utilisateurs).
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

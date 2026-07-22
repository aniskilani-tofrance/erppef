"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { signAttendance, type SheetLearner } from "@/app/emargement/[token]/actions";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "./signature-pad";

// Écran tablette : liste des inscrits → signature → retour à la liste.
export function SignSheet({ token, learners }: { token: string; learners: SheetLearner[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SheetLearner | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!selected || !signature) return;
    startTransition(async () => {
      const result = await signAttendance({ token, learnerId: selected.id, signature });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(null);
      setSignature(null);
      setError(null);
      router.refresh();
    });
  }

  if (selected) {
    return (
      <div className="space-y-4 rounded-lg border bg-background p-4">
        <p className="text-center text-lg font-medium">{selected.name}</p>
        <SignaturePad onChange={setSignature} />
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => { setSelected(null); setSignature(null); setError(null); }}
            disabled={pending}
          >
            Retour
          </Button>
          <Button className="flex-1" onClick={submit} disabled={pending || !signature}>
            {pending ? "Enregistrement…" : "Valider ma signature"}
          </Button>
        </div>
      </div>
    );
  }

  const signedCount = learners.filter((l) => l.signedAt).length;

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-muted-foreground">
        {signedCount} / {learners.length} signatures
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {learners.map((l) => (
          <li key={l.id}>
            {l.signedAt ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted px-4 py-3 text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">{l.name}</span>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-md border bg-background px-4 py-3 text-left font-medium transition-colors hover:bg-muted"
                onClick={() => { setSelected(l); setError(null); }}
              >
                {l.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

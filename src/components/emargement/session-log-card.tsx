"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenText } from "lucide-react";
import { saveSessionLog } from "@/app/(app)/seances/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Log = { done: string | null; next: string | null; updatedAt: string | null };

// Cahier de séance : deux lignes en fin de cours, et ce qu'avait noté la séance
// précédente (utile au remplaçant, à la co-animatrice et à la coordination).
export function SessionLogCard({
  sessionId,
  available,
  current,
  previous,
  canEdit,
}: {
  sessionId: string;
  available: boolean;
  current: Log | null;
  previous: (Log & { dayLabel: string }) | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(current?.done ?? "");
  const [next, setNext] = useState(current?.next ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = done !== (current?.done ?? "") || next !== (current?.next ?? "");

  function save() {
    startTransition(async () => {
      const res = await saveSessionLog({ sessionId, done, next });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Cahier de séance enregistré");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpenText className="h-4 w-4 text-primary" />
          Cahier de séance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!available ? (
          <p className="text-muted-foreground">Le cahier de séance sera disponible dès la prochaine mise à jour de la base.</p>
        ) : (
          <>
            {previous && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-1 font-medium">La dernière fois ({previous.dayLabel})</p>
                {previous.done && <p className="whitespace-pre-line"><span className="text-muted-foreground">Fait : </span>{previous.done}</p>}
                {previous.next && <p className="whitespace-pre-line"><span className="text-muted-foreground">Prévu ensuite : </span>{previous.next}</p>}
              </div>
            )}
            {canEdit ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="log-done">Ce qu&apos;on a fait aujourd&apos;hui</Label>
                  <Textarea
                    id="log-done"
                    value={done}
                    onChange={(e) => setDone(e.target.value)}
                    placeholder="Ex. : se présenter, l'alphabet, épeler son nom ; jeu de rôle à l'accueil."
                    rows={2}
                    maxLength={2000}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="log-next">Pour la prochaine fois</Label>
                  <Textarea
                    id="log-next"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    placeholder="Ex. : reprendre les nombres ; apporter un justificatif de domicile (exercice)."
                    rows={2}
                    maxLength={2000}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={save} disabled={pending || !dirty}>
                    {pending ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                  {current?.updatedAt && !dirty && (
                    <span className="text-xs text-muted-foreground">
                      Enregistré le{" "}
                      {new Date(current.updatedAt).toLocaleString("fr-FR", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
                      })}
                    </span>
                  )}
                </div>
              </>
            ) : current?.done || current?.next ? (
              <div>
                {current.done && <p className="whitespace-pre-line"><span className="text-muted-foreground">Fait : </span>{current.done}</p>}
                {current.next && <p className="whitespace-pre-line"><span className="text-muted-foreground">Prévu ensuite : </span>{current.next}</p>}
              </div>
            ) : (
              <p className="text-muted-foreground">Pas encore rempli pour cette séance.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

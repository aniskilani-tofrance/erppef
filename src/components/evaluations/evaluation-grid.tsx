"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ClipboardCopy, FileBadge, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { launchEvaluationTests, saveEvaluation } from "@/app/(app)/groupes/[id]/evaluations/actions";
import { WhatsAppButton } from "@/components/admission/whatsapp-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { buildEvaluationInvitation } from "@/lib/evaluations/messages";
import { CECRL_LEVELS, MARKS, SKILLS, suggestMark, type EvaluationKind, type Mark } from "@/lib/evaluations/grid";
import type { EvaluationLearnerRow } from "@/lib/evaluations/data";
import { learnerRef } from "@/lib/refs";
import { cn } from "@/lib/utils";

type RowState = { co: Mark | null; po: Mark | null; ce: Mark | null; pe: Mark | null; levelReached: string | null; comment: string; saved: "idle" | "saving" | "ok" | "error" };

// Grille d'évaluation d'un jalon : un apprenant par ligne, quatre compétences en trois crans
// (boutons NA / EC / A), niveau atteint, commentaire. Enregistrement automatique à chaque
// changement. Colonne test : lien à envoyer, ou résultat à reprendre dans la grille.
export function EvaluationGrid({
  groupId,
  kind,
  rows,
  origin,
  senderFirstName,
  canEdit,
}: {
  groupId: string;
  kind: EvaluationKind;
  rows: EvaluationLearnerRow[];
  origin: string;
  senderFirstName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => {
        const e = r.evals[kind];
        return [r.learnerId, { co: e?.co ?? null, po: e?.po ?? null, ce: e?.ce ?? null, pe: e?.pe ?? null, levelReached: e?.levelReached ?? null, comment: e?.comment ?? "", saved: "idle" as const }];
      }),
    ),
  );
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function update(learnerId: string, patch: Partial<RowState>) {
    setState((prev) => {
      const next = { ...prev[learnerId], ...patch, saved: "saving" as const };
      scheduleSave(learnerId, next);
      return { ...prev, [learnerId]: next };
    });
  }

  function scheduleSave(learnerId: string, row: RowState) {
    clearTimeout(timers.current[learnerId]);
    timers.current[learnerId] = setTimeout(async () => {
      const result = await saveEvaluation({
        groupId, learnerId, kind,
        co: row.co, po: row.po, ce: row.ce, pe: row.pe,
        levelReached: row.levelReached, comment: row.comment || null,
      });
      setState((prev) => ({ ...prev, [learnerId]: { ...prev[learnerId], saved: result.ok ? "ok" : "error" } }));
      if (!result.ok) toast.error(result.error);
    }, 600);
  }

  async function launch() {
    setLaunching(true);
    const result = await launchEvaluationTests({ groupId, kind });
    setLaunching(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(result.created ? `${result.created} lien${result.created > 1 ? "s" : ""} de test créé${result.created > 1 ? "s" : ""} : envoyez-les par WhatsApp.` : "Tout le monde a déjà son lien.");
      router.refresh();
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié.");
    } catch {
      toast.error("Copie impossible : sélectionnez le lien à la main.");
    }
  }

  const missingTests = rows.filter((r) => !r.tests[kind]).length;

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button size="sm" variant="outline" onClick={launch} disabled={launching || missingTests === 0} title="Crée un lien de test ciblé (niveau visé du groupe, 20 questions) pour chaque inscrit qui n'en a pas">
            {launching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
            {missingTests ? `Lancer les tests (${missingTests})` : "Tests lancés"}
          </Button>
          <span className="text-muted-foreground">
            La grille est la référence ; le test est un appui (« Reprendre » pré-remplit la ligne, à ajuster).
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Apprenant</th>
              <th className="px-3 py-2 text-left font-medium">Test</th>
              {SKILLS.map((s) => (
                <th key={s.code} className="px-2 py-2 text-center font-medium" title={s.hint}>{s.short}</th>
              ))}
              <th className="px-2 py-2 text-left font-medium">Niveau atteint</th>
              <th className="px-2 py-2 text-left font-medium">Commentaire</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Aucun inscrit dans ce groupe.</td></tr>
            )}
            {rows.map((r) => {
              const st = state[r.learnerId];
              const test = r.tests[kind];
              const url = test ? `${origin}/test/${test.token}` : null;
              const complete = st.co && st.po && st.ce && st.pe;
              return (
                <tr key={r.learnerId} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.firstName} {r.lastName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {learnerRef(r.learnerNo)}<span className="font-sans"> · entrée : {r.entryLevel ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {!test && <span className="text-muted-foreground">—</span>}
                    {test && test.status === "en_attente" && url && (
                      <div className="flex flex-wrap items-center gap-1">
                        <WhatsAppButton
                          phone={r.phone}
                          message={buildEvaluationInvitation({ firstName: r.firstName, kind, url, senderFirstName })}
                          trace={{ kind: "contact", learnerId: r.learnerId, note: `Lien du test ${kind === "finale" ? "final" : "de mi-parcours"} envoyé (WhatsApp)` }}
                          iconOnly size="icon" variant="ghost" title="Envoyer le lien du test sur WhatsApp"
                        />
                        <Button variant="ghost" size="icon" onClick={() => copy(url)} title="Copier le lien du test">
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs text-muted-foreground">à passer</span>
                      </div>
                    )}
                    {test && test.status === "fait" && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs">
                          <b>{test.score ?? "—"} %</b>{test.level ? ` · ${test.level}` : ""}
                        </span>
                        {canEdit && (
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            title="Pré-remplit les quatre compétences et le niveau d'après le score (à ajuster)"
                            onClick={() => {
                              const m = suggestMark(test.score ?? 0);
                              update(r.learnerId, { co: m, po: m, ce: m, pe: m, levelReached: test.level?.replace(/\s*\(en cours\)$/, "") ?? st.levelReached });
                            }}
                          >
                            <Sparkles className="mr-1 h-3 w-3" /> Reprendre
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  {SKILLS.map((s) => (
                    <td key={s.code} className="px-2 py-2">
                      <div className="inline-flex rounded-md border" role="radiogroup" aria-label={`${s.label} — ${r.firstName} ${r.lastName}`}>
                        {MARKS.map((m) => (
                          <button
                            key={m.code}
                            type="button"
                            role="radio"
                            aria-checked={st[s.code] === m.code}
                            disabled={!canEdit}
                            title={m.label}
                            onClick={() => update(r.learnerId, { [s.code]: st[s.code] === m.code ? null : m.code } as Partial<RowState>)}
                            className={cn(
                              "px-2 py-1 text-xs font-medium first:rounded-l-md last:rounded-r-md",
                              st[s.code] === m.code
                                ? m.code === "acquis" ? "bg-emerald-600 text-white" : m.code === "en_cours" ? "bg-amber-500 text-white" : "bg-slate-500 text-white"
                                : "text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {m.short}
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <Select value={st.levelReached ?? "nc"} onValueChange={(v) => update(r.learnerId, { levelReached: v === "nc" ? null : v })} disabled={!canEdit}>
                      <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nc">—</SelectItem>
                        {CECRL_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={st.comment}
                      onChange={(e) => update(r.learnerId, { comment: e.target.value })}
                      placeholder="Appréciation (facultatif)"
                      className="h-8 min-w-[180px] text-xs"
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {st.saved === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {st.saved === "ok" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      {st.saved === "error" && <span className="text-xs text-destructive">!</span>}
                      {kind === "finale" && complete && (
                        <a href={`/groupes/${groupId}/attestation/${r.learnerId}`} title="Attestation d'acquis (PDF)" className="text-muted-foreground hover:text-foreground">
                          <FileBadge className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        NA = non acquis · EC = en cours d&apos;acquisition · A = acquis. Cliquez à nouveau pour effacer. Enregistrement automatique.
        {kind === "finale" && " L'icône attestation apparaît quand les quatre compétences sont renseignées."}
      </p>
    </div>
  );
}

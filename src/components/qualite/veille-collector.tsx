import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Traces du collecteur de veille (Manus) : journal des exécutions et notes mensuelles.
// Lecture seule : ces données arrivent par l'API /api/veille/* et servent de preuve de
// régularité (critère 6). Aucune donnée personnelle n'y figure.

export type VeilleRunView = {
  runId: string;
  status: "en_cours" | "succes" | "partiel" | "echec";
  received: number;
  created: number;
  ignored: number;
  rejected: number;
  replays: number;
  startedAt: string | null;
  finishedAt: string | null;
  csvUrl: string | null;
  csvName: string | null;
  message: string | null;
  notifiedAt: string | null;
};

export type VeilleNoteView = {
  id: string;
  month: string; // AAAA-MM
  title: string;
  content: string;
  runId: string | null;
  entriesCount: number | null;
  updatedAt: string;
};

const RUN_STATUS: Record<VeilleRunView["status"], { label: string; className: string }> = {
  en_cours: { label: "En cours", className: "border-sky-300 bg-sky-50 text-sky-800" },
  succes: { label: "Succès", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  partiel: { label: "Partiel", className: "border-amber-300 bg-amber-50 text-amber-800" },
  echec: { label: "Échec", className: "border-red-300 bg-red-50 text-red-700" },
};

function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-15T12:00:00Z`);
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function VeilleCollector({ runs, notes }: { runs: VeilleRunView[]; notes: VeilleNoteView[] }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exécutions du collecteur de veille</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune exécution enregistrée. Le collecteur dépose ses fiches chaque semaine par
              l&apos;API de veille ; chaque passage apparaît ici avec ses compteurs.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Exécution</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Reçues</TableHead>
                  <TableHead className="text-right">Créées</TableHead>
                  <TableHead className="text-right">Doublons</TableHead>
                  <TableHead>Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const st = RUN_STATUS[r.status] ?? RUN_STATUS.en_cours;
                  return (
                    <TableRow key={r.runId}>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(r.finishedAt ?? r.startedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.runId}</TableCell>
                      <TableCell><Badge variant="outline" className={st.className}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right">{r.received}</TableCell>
                      <TableCell className="text-right font-medium">{r.created}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.ignored}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.replays > 0 && <span>{r.replays} rejeu{r.replays > 1 ? "x" : ""} · </span>}
                        {r.csvUrl && (
                          <a href={r.csvUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                            {r.csvName ?? "CSV de secours"}
                          </a>
                        )}
                        {r.csvUrl && r.message && " · "}
                        {r.message}
                        {r.notifiedAt && <span> · résumé envoyé</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes mensuelles de veille</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune note mensuelle. Le collecteur en dépose une par mois : la synthèse à
              présenter en réunion d&apos;équipe et à l&apos;auditeur.
            </p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      {monthLabel(n.month)} — {n.title}
                      {n.entriesCount !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">{n.entriesCount} fiche{n.entriesCount > 1 ? "s" : ""}</span>}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted-foreground">{n.content}</pre>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Mise à jour le {fmtDateTime(n.updatedAt)}{n.runId ? ` · exécution ${n.runId}` : ""}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

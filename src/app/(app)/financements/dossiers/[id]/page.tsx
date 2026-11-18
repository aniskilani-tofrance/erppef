import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadFundersLite, loadTeam, requireFinancements } from "@/lib/financements/acces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PORTAL_LABELS, STAGE_LABELS, type DeadlineKind, type Portal, type Stage } from "@/lib/financements/constants";
import { applicationProgress } from "@/lib/financements/atelier";
import { inputFromDeadline } from "@/lib/financements/echeances";
import { formatDay, formatDueAt, formatEuros } from "@/lib/financements/liens";
import { DEADLINE_SELECT, DeadlineLine, StageBadge, toDeadlineView, UrgencyDot } from "@/components/financements/affichage";
import { ApplicationFormDialog } from "@/components/financements/application-form-dialog";
import { DeadlineFormDialog } from "@/components/financements/deadline-form-dialog";
import { StageMenu } from "@/components/financements/stage-menu";
import { CopyButton, DeleteDeadlineButton } from "@/components/financements/petits-boutons";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
}

// Fiche du dossier : champs, échéances liées, historique des statuts, « Ouvrir le Word »,
// « Copier » le numéro de dossier du portail.
export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data: a }, { data: deadlines }, { data: events }, funders, team, { data: sections }] = await Promise.all([
    supabase
      .from("funding_applications")
      .select("*, funders(id, name), funding_opportunities(id, title, url)")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase.from("funding_deadlines").select(DEADLINE_SELECT).eq("org_id", orgId).eq("application_id", id).order("due_at"),
    supabase
      .from("funding_application_events")
      .select("id, from_stage, to_stage, author_id, comment, created_at")
      .eq("org_id", orgId)
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    loadFundersLite(orgId),
    loadTeam(orgId),
    supabase.from("funding_application_sections").select("title, content, max_chars").eq("org_id", orgId).eq("application_id", id),
  ]);
  if (!a) notFound();
  const progress = applicationProgress(sections ?? []);

  const stage = a.stage as Stage;
  const funder = a.funders as unknown as { id: string; name: string } | null;
  const opp = a.funding_opportunities as unknown as { id: string; title: string; url: string | null } | null;
  const names = new Map(team.map((m) => [m.userId, m.name]));
  const dl = inputFromDeadline(a.deadline_at);
  const num = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <div className="space-y-4">
      <Link href="/financements/dossiers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Dossiers
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <StageBadge stage={stage} />
          <h2 className="text-xl font-semibold leading-snug">{a.title}</h2>
          {funder && <Link href={`/financements/financeurs/${funder.id}`} className="text-sm text-muted-foreground hover:underline">{funder.name}</Link>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/financements/dossiers/${a.id}/atelier`}><PenLine className="h-4 w-4" />Atelier de rédaction</Link>
          </Button>
          {a.drive_url && (
            <Button asChild size="sm" variant="outline">
              <a href={a.drive_url} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" />Ouvrir le Word</a>
            </Button>
          )}
          <ApplicationFormDialog
            funders={funders}
            team={team}
            initial={{
              id: a.id, title: a.title, funder_id: a.funder_id, owner_id: a.owner_id, next_step: a.next_step, next_step_due: a.next_step_due,
              deadline_day: dl.day, deadline_time: dl.time, amount_requested: num(a.amount_requested), amount_granted: num(a.amount_granted),
              portal: a.portal as Portal | null, portal_ref: a.portal_ref, drive_url: a.drive_url, notes: a.notes,
            }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <p className="text-sm font-medium">Statut : {STAGE_LABELS[stage]}</p>
          <StageMenu id={a.id} stage={stage} withComment />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Le dossier</CardTitle></CardHeader>
        <CardContent>
          <dl className="space-y-2.5">
            <Row label="Responsable">{a.owner_id ? names.get(a.owner_id) ?? "—" : "—"}</Row>
            <Row label="Prochaine étape">
              {a.next_step ?? "—"}
              {a.next_step_due && <span className="text-muted-foreground"> — pour le {formatDay(a.next_step_due)}</span>}
            </Row>
            <Row label="Date limite de dépôt">
              {a.deadline_at ? <span className="inline-flex items-center gap-1.5"><UrgencyDot dueAt={a.deadline_at} />{formatDueAt(a.deadline_at)}</span> : "—"}
            </Row>
            <Row label="Montant demandé">{formatEuros(a.amount_requested)}</Row>
            <Row label="Montant accordé">{formatEuros(a.amount_granted)}{a.granted_on && <span className="text-muted-foreground"> (accord du {formatDay(a.granted_on)})</span>}</Row>
            <Row label="Portail">{a.portal ? PORTAL_LABELS[a.portal as Portal] : "—"}</Row>
            <Row label="N° de dossier">
              {a.portal_ref ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{a.portal_ref}</code>
                  <CopyButton value={a.portal_ref} />
                </span>
              ) : "—"}
            </Row>
            {opp && (
              <Row label="Né de l'opportunité">
                <Link href={`/financements/veille/${opp.id}`} className="hover:underline">{opp.title}</Link>
              </Row>
            )}
            <Row label="Rédaction">
              {progress.total === 0 ? (
                <Link href={`/financements/dossiers/${a.id}/atelier`} className="text-primary hover:underline">Choisir les rubriques et commencer à écrire</Link>
              ) : (
                <Link href={`/financements/dossiers/${a.id}/atelier`} className="hover:underline">
                  {progress.filled} rubrique{progress.filled > 1 ? "s" : ""} sur {progress.total} rédigée{progress.filled > 1 ? "s" : ""}
                  {progress.tooLong > 0 && <span className="text-red-700"> · {progress.tooLong} trop longue{progress.tooLong > 1 ? "s" : ""}</span>}
                </Link>
              )}
            </Row>
            <Row label="Notes"><span className="whitespace-pre-line">{a.notes || "—"}</span></Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Échéances</CardTitle>
          <DeadlineFormDialog
            funders={funders}
            applications={[{ id: a.id, title: a.title }]}
            opportunities={[]}
            preset={{ application_id: a.id }}
            triggerVariant="outline"
          />
        </CardHeader>
        <CardContent>
          {!deadlines?.length ? (
            <p className="text-sm text-muted-foreground">Aucune échéance. Une date limite de dépôt crée la sienne automatiquement.</p>
          ) : (
            <ul className="divide-y">
              {deadlines.map((d) => {
                const v = toDeadlineView(d);
                const due = inputFromDeadline(d.due_at);
                return (
                  <DeadlineLine
                    key={d.id}
                    d={{ ...v, context: null }}
                    actions={
                      <>
                        <DeadlineFormDialog
                          funders={funders}
                          applications={[{ id: a.id, title: a.title }]}
                          opportunities={[]}
                          initial={{
                            id: d.id, kind: d.kind as DeadlineKind, title: d.title, due_day: due.day, due_time: due.time,
                            application_id: d.application_id, opportunity_id: d.opportunity_id, funder_id: d.funder_id,
                            reminder_days: (d.reminder_days as number[] | null) ?? [], auto: !!d.auto_origin,
                          }}
                        />
                        {!d.auto_origin && <DeleteDeadlineButton id={d.id} />}
                      </>
                    }
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Historique des statuts</CardTitle></CardHeader>
        <CardContent>
          {!events?.length ? (
            <p className="text-sm text-muted-foreground">Aucun changement enregistré.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-muted-foreground">{fmtDateTime(e.created_at)}</span>{" "}
                  {e.from_stage ? (
                    <>
                      {STAGE_LABELS[e.from_stage as Stage]} → <strong>{STAGE_LABELS[e.to_stage as Stage]}</strong>
                    </>
                  ) : (
                    <>Créé en <strong>{STAGE_LABELS[e.to_stage as Stage]}</strong></>
                  )}
                  {e.author_id && <span className="text-muted-foreground"> · {names.get(e.author_id) ?? "un membre de l'équipe"}</span>}
                  {!e.author_id && <span className="text-muted-foreground"> · reprise automatique</span>}
                  {e.comment && <p className="ml-4 text-muted-foreground">« {e.comment} »</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

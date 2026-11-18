import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai/client";
import { requireFinancements } from "@/lib/financements/acces";
import { defaultTemplateForPortal, type BlockCategory } from "@/lib/financements/atelier";
import { budgetLabel, loadAiBudget } from "@/lib/financements/budget-ia";
import { figurePeriods } from "@/lib/financements/chiffres";
import type { Portal, Stage } from "@/lib/financements/constants";
import { parisDay } from "@/lib/financements/echeances";
import { formatDueAt } from "@/lib/financements/liens";
import { StageBadge, UrgencyDot } from "@/components/financements/affichage";
import { AtelierEditor } from "@/components/financements/atelier-editor";

// Une proposition de l'IA peut prendre une minute : on laisse le temps à l'action serveur.
export const maxDuration = 120;

// Atelier de rédaction d'un dossier (lot 2) : les rubriques du formulaire du financeur,
// dans l'ordre, avec la bibliothèque de textes, les chiffres de l'ERP et l'IA.
export default async function AtelierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { orgId } = await requireFinancements();
  const supabase = await createClient();
  const [{ data: a }, { data: sections }, { data: blocks }, budget] = await Promise.all([
    supabase
      .from("funding_applications")
      .select("id, title, stage, portal, template_key, deadline_at, funders(name), funding_opportunities(id, title, url, summary, criteria, required_documents)")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("funding_application_sections")
      .select("id, title, guidance, max_chars, content")
      .eq("org_id", orgId)
      .eq("application_id", id)
      .order("position")
      .order("created_at"),
    supabase.from("funding_text_blocks").select("id, title, category, content").eq("org_id", orgId).order("category").order("title"),
    loadAiBudget(supabase, orgId),
  ]);
  if (!a) notFound();

  const funder = a.funders as unknown as { name: string } | null;
  const opp = a.funding_opportunities as unknown as {
    id: string; title: string; url: string | null; summary: string | null; criteria: string | null; required_documents: string | null;
  } | null;
  const aiEnabled = aiConfigured();
  const aiNote = aiEnabled ? `${budgetLabel(budget)}.` : "L'écriture avec l'IA n'est pas activée sur cet ERP.";

  return (
    <div className="space-y-4">
      <Link href={`/financements/dossiers/${a.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Fiche du dossier
      </Link>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={a.stage as Stage} />
          {a.deadline_at && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <UrgencyDot dueAt={a.deadline_at} />
              Dépôt avant le {formatDueAt(a.deadline_at)}
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold leading-snug">Atelier de rédaction — {a.title}</h2>
        {funder && <p className="text-sm text-muted-foreground">{funder.name}</p>}
      </div>

      {opp && (opp.summary || opp.criteria || opp.required_documents) && (
        <details className="rounded-lg border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-medium">Ce que demande l&apos;appel — {opp.title}</summary>
          <div className="mt-2 space-y-2">
            {opp.summary && <p className="whitespace-pre-line">{opp.summary}</p>}
            {opp.criteria && (
              <div>
                <p className="font-medium">Critères de sélection</p>
                <p className="whitespace-pre-line text-muted-foreground">{opp.criteria}</p>
              </div>
            )}
            {opp.required_documents && (
              <div>
                <p className="font-medium">Pièces à joindre</p>
                <p className="whitespace-pre-line text-muted-foreground">{opp.required_documents}</p>
              </div>
            )}
            {opp.url && (
              <a href={opp.url} target="_blank" rel="noopener noreferrer" className="inline-block text-primary hover:underline">Ouvrir le texte de l&apos;appel</a>
            )}
          </div>
        </details>
      )}

      <AtelierEditor
        applicationId={a.id}
        title={a.title}
        sections={(sections ?? []).map((s) => ({ id: s.id, title: s.title, guidance: s.guidance, max_chars: s.max_chars, content: s.content }))}
        blocks={(blocks ?? []).map((b) => ({ id: b.id, title: b.title, category: b.category as BlockCategory, content: b.content }))}
        periods={figurePeriods(parisDay(new Date()))}
        aiEnabled={aiEnabled && !budget.exceeded}
        aiNote={aiEnabled && budget.exceeded ? `${budgetLabel(budget)} : plafond du mois atteint, l'IA reprend le 1er.` : aiNote}
        defaultTemplate={defaultTemplateForPortal(a.portal as Portal | null)}
        templateChosen={!!a.template_key}
      />
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Copy, Download, LayoutTemplate, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { applyTemplate, deleteSection, moveSection, saveSectionContent } from "@/app/(app)/financements/atelier-actions";
import {
  appendText, applicationProgress, assembleText, countChars, sectionState, SECTION_TEMPLATES, TEMPLATE_KEYS, type TemplateKey,
} from "@/lib/financements/atelier";
import type { FigurePeriod } from "@/lib/financements/chiffres";
import { cn } from "@/lib/utils";
import { AiDraftDialog, InsertDialog, SectionFormDialog, VersionsDialog, type BlockLite } from "./atelier-dialogues";

export type SectionData = { id: string; title: string; guidance: string | null; max_chars: number | null; content: string };

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} : copié. Collez-le dans le formulaire du financeur.`);
    return true;
  } catch {
    toast.error("Copie impossible : sélectionnez le texte à la main.");
    return false;
  }
}

// Atelier de rédaction d'un dossier : une carte par rubrique, dans l'ordre du formulaire
// du financeur. Le texte s'enregistre tout seul ; « Copier » le met dans le presse-papiers.
export function AtelierEditor({
  applicationId, title, sections, blocks, periods, aiEnabled, aiNote, defaultTemplate, templateChosen,
}: {
  applicationId: string;
  title: string;
  templateChosen: boolean;
  sections: SectionData[];
  blocks: BlockLite[];
  periods: FigurePeriod[];
  aiEnabled: boolean;
  aiNote: string | null;
  defaultTemplate: TemplateKey | null;
}) {
  // Texte en cours de chaque rubrique (ce qui est à l'écran fait foi tant que la page est ouverte).
  const [values, setValues] = useState<Record<string, string>>({});
  const valueOf = (s: SectionData) => values[s.id] ?? s.content;
  const setValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  if (sections.length === 0) {
    // Dossier libre déjà choisi : on ajoute ses rubriques une à une (un modèle reste possible).
    return (
      <div className="space-y-4">
        {templateChosen && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <p className="text-sm text-muted-foreground">Dossier libre : ajoutez les rubriques du formulaire du financeur, dans son ordre.</p>
              <SectionFormDialog applicationId={applicationId} />
            </CardContent>
          </Card>
        )}
        <TemplateChooser applicationId={applicationId} defaultTemplate={defaultTemplate} />
      </div>
    );
  }

  const current = sections.map((s) => ({ title: s.title, content: valueOf(s), max_chars: s.max_chars }));
  const progress = applicationProgress(current);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {progress.filled} rubrique{progress.filled > 1 ? "s" : ""} sur {progress.total} rédigée{progress.filled > 1 ? "s" : ""}
              {progress.tooLong > 0 && <span className="text-red-700"> · {progress.tooLong} trop longue{progress.tooLong > 1 ? "s" : ""}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              Le texte s&apos;enregistre tout seul. « Copier » met la rubrique dans le presse-papiers, prête à coller dans le portail.
              {aiNote ? ` ${aiNote}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => copyText(assembleText(title, current), "Dossier entier")}>
              <Copy className="h-3.5 w-3.5" />Tout copier
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/financements/dossiers/${applicationId}/export`}><Download className="h-3.5 w-3.5" />Exporter en Word</a>
            </Button>
            <SectionFormDialog applicationId={applicationId} />
          </div>
        </CardContent>
      </Card>

      {sections.map((s, i) => (
        <SectionCard
          key={s.id}
          applicationId={applicationId}
          section={s}
          index={i}
          count={sections.length}
          value={valueOf(s)}
          onChange={(v) => setValue(s.id, v)}
          blocks={blocks}
          periods={periods}
          aiEnabled={aiEnabled}
        />
      ))}
    </div>
  );
}

function TemplateChooser({ applicationId, defaultTemplate }: { applicationId: string; defaultTemplate: TemplateKey | null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function choose(key: TemplateKey) {
    startTransition(async () => {
      const r = await applyTemplate(applicationId, key);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.refresh();
    });
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><LayoutTemplate className="h-4 w-4" />Choisir les rubriques du dossier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Partez du formulaire du financeur : un modèle pose ses rubriques dans l&apos;ordre. Vous pourrez ensuite en ajouter, en renommer, en déplacer, et saisir la limite de caractères de chacune.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATE_KEYS.map((key) => {
            const t = SECTION_TEMPLATES[key];
            const suggested = key === defaultTemplate;
            return (
              <div key={key} className={cn("flex flex-col gap-2 rounded-lg border p-3", suggested && "border-primary bg-primary/5")}>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t.label}
                    {suggested && <span className="ml-2 text-xs font-normal text-primary">proposé d&apos;après le portail du dossier</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                  {t.sections.length > 0 && <p className="text-xs text-muted-foreground">{t.sections.map((s) => s.title).join(" · ")}</p>}
                </div>
                <Button type="button" size="sm" variant={suggested ? "default" : "outline"} className="mt-auto self-start" disabled={pending} onClick={() => choose(key)}>
                  {t.sections.length ? `Utiliser ce modèle (${t.sections.length} rubriques)` : "Commencer sans modèle"}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

type SaveStatus = "saved" | "dirty" | "saving" | "error";
const STATUS_LABELS: Record<SaveStatus, string> = {
  saved: "Enregistré",
  dirty: "Modifié…",
  saving: "Enregistrement…",
  error: "Non enregistré",
};

function SectionCard({
  applicationId, section, index, count, value, onChange, blocks, periods, aiEnabled,
}: {
  applicationId: string;
  section: SectionData;
  index: number;
  count: number;
  value: string;
  onChange: (v: string) => void;
  blocks: BlockLite[];
  periods: FigurePeriod[];
  aiEnabled: boolean;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(section.content);
  const router = useRouter();

  async function save(): Promise<boolean> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const text = latest.current;
    setStatus("saving");
    const r = await saveSectionContent(section.id, text);
    if (!r.ok) {
      setStatus("error");
      toast.error(r.error);
      return false;
    }
    setStatus(latest.current === text ? "saved" : "dirty");
    return true;
  }

  // Saisie : on enregistre 0,9 s après la dernière frappe (et à la sortie du champ).
  function edit(next: string) {
    onChange(next);
    latest.current = next;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
  }

  // Le serveur a changé le texte (proposition acceptée, version reprise) : déjà enregistré.
  function setFromServer(content: string) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    latest.current = content;
    onChange(content);
    setStatus("saved");
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const r = await moveSection(section.id, direction);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }
  function remove() {
    const warn = value.trim() ? `Supprimer la rubrique « ${section.title} » et son texte ?` : `Supprimer la rubrique « ${section.title} » ?`;
    if (!confirm(warn)) return;
    startTransition(async () => {
      const r = await deleteSection(section.id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    });
  }
  async function copy() {
    if (await copyText(value, section.title)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const chars = countChars(value);
  const state = sectionState(value, section.max_chars);
  const flush = async () => (status === "saved" ? true : save());

  return (
    <Card className={cn(state === "trop_long" && "border-red-300")}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="text-base leading-snug">
            <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
            {section.title}
          </CardTitle>
          {section.guidance && <p className="text-xs text-muted-foreground">{section.guidance}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending || index === 0} onClick={() => move("up")} aria-label="Monter la rubrique" title="Monter"><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending || index === count - 1} onClick={() => move("down")} aria-label="Descendre la rubrique" title="Descendre"><ArrowDown className="h-3.5 w-3.5" /></Button>
          <SectionFormDialog applicationId={applicationId} initial={{ id: section.id, title: section.title, guidance: section.guidance, max_chars: section.max_chars }} />
          <VersionsDialog sectionId={section.id} sectionTitle={section.title} beforeKeep={flush} onRestored={setFromServer} />
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={remove} aria-label="Supprimer la rubrique" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => edit(e.target.value)}
          onBlur={() => {
            if (status === "dirty" || status === "error") void save();
          }}
          rows={Math.min(22, Math.max(6, Math.ceil(chars / 95) + 2))}
          maxLength={20000}
          aria-label={section.title}
          placeholder="Écrivez ici, insérez un texte de la bibliothèque, ou demandez une première version à l'IA."
          className="text-sm leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={cn("tabular-nums", state === "trop_long" ? "font-medium text-red-700" : "text-muted-foreground")}>
              {chars.toLocaleString("fr-FR")}
              {section.max_chars ? ` / ${section.max_chars.toLocaleString("fr-FR")}` : ""} caractères
              {state === "trop_long" && section.max_chars ? ` — ${(chars - section.max_chars).toLocaleString("fr-FR")} de trop` : ""}
            </span>
            <span className={cn(status === "error" ? "font-medium text-red-700" : "text-muted-foreground")} aria-live="polite">{STATUS_LABELS[status]}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <InsertDialog blocks={blocks} periods={periods} onInsert={(text) => edit(appendText(value, text))} />
            {aiEnabled && (
              <AiDraftDialog
                sectionId={section.id}
                sectionTitle={section.title}
                maxChars={section.max_chars}
                hasText={!!value.trim()}
                blocks={blocks}
                periods={periods}
                beforeAsk={flush}
                onAccepted={setFromServer}
              />
            )}
            <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!value.trim()}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copier
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

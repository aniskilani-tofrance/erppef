"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareText, RotateCcw } from "lucide-react";
import { saveMessageTemplates } from "@/app/(app)/apprenants/admission/actions";
import {
  DEFAULT_TEMPLATES,
  MESSAGE_STAGES,
  renderTemplate,
  type MessageStage,
  type Templates,
} from "@/lib/admission/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const VAR_HELP: Record<string, string> = {
  prenom: "prénom de la personne",
  expediteur: "votre prénom",
  signature: "votre prénom (ou « L'équipe … »)",
  organisme: "Parler Emploi Formation",
  lien: "lien personnel du test",
  date: "date et heure de la réunion",
  lieu: "salle ou adresse",
  acces: "consignes pour trouver la salle (fiche de la salle)",
  groupe: "nom du groupe",
  date_debut: "date du premier cours",
  date_fin: "date du dernier cours",
  horaires: "créneaux hebdomadaires du groupe",
  vacances: "mention vacances scolaires",
  niveau: "niveau évalué",
};

const PREVIEW_VARS = {
  prenom: "Fatima", expediteur: "Marie", signature: "Marie", organisme: "Parler Emploi Formation",
  lien: "https://pef-erp.vercel.app/test/exemple", date: "mardi 6 octobre 2026 à 14h00", lieu: "Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen",
  acces: "Métro 13 Mairie de Saint-Ouen. Sonner « ParlerEmploi », 2e étage.",
  groupe: "PEF A1 — Groupe 1", date_debut: "jeudi 1er octobre 2026", date_fin: "mardi 8 juin 2027",
  horaires: "lundi 9h-12h · mardi 9h-12h · mardi 13h-16h", vacances: "Pas de cours pendant les vacances scolaires.", niveau: "A1",
};

// Retouche des messages, étape par étape : un texte par étape, variables entre accolades,
// aperçu rempli avec un exemple. Enregistré pour tout l'organisme, sans redéploiement.
export function MessageTemplatesDialog({ templates }: { templates: Templates }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Templates>(templates);
  const [active, setActive] = useState<MessageStage>(MESSAGE_STAGES[0].code);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const stage = MESSAGE_STAGES.find((s) => s.code === active)!;
  const dirty = MESSAGE_STAGES.some((s) => values[s.code] !== templates[s.code]);

  function save() {
    startTransition(async () => {
      const result = await saveMessageTemplates(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Messages enregistrés pour toute l'équipe.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Retoucher le texte de chaque message (WhatsApp et email)">
          <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
          Messages
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Les messages, étape par étape</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="space-y-1">
            {MESSAGE_STAGES.map((s) => (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => setActive(s.code)}
                  className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${s.code === active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {s.label}
                  {values[s.code] !== DEFAULT_TEMPLATES[s.code] && (
                    <span className="ml-1 text-[10px] uppercase opacity-70">modifié</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{stage.when}</p>
            <div className="flex flex-wrap gap-1">
              {stage.variables.map((v) => (
                <Badge key={v} variant="outline" title={VAR_HELP[v]} className="font-mono text-[11px]">{`{${v}}`}</Badge>
              ))}
            </div>
            <Textarea
              value={values[active]}
              onChange={(e) => setValues((s) => ({ ...s, [active]: e.target.value }))}
              rows={12}
              className="font-mono text-xs leading-relaxed"
            />
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Aperçu avec un exemple</p>
              <pre className="whitespace-pre-wrap font-sans text-sm">{renderTemplate(values[active], PREVIEW_VARS)}</pre>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setValues((s) => ({ ...s, [active]: DEFAULT_TEMPLATES[active] }))}
                disabled={values[active] === DEFAULT_TEMPLATES[active]}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Revenir au texte d&apos;origine
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
                <Button onClick={save} disabled={pending || !dirty}>{pending ? "Enregistrement…" : "Enregistrer pour l'équipe"}</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

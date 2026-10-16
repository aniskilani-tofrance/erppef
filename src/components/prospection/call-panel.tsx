"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, MapPin, Phone, SkipForward } from "lucide-react";
import { logProspectCall, qualifyProspect, updateProspectContact } from "@/app/(app)/prospection/actions";
import type { LeadRow, Owner } from "@/lib/leads/queries";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { formatPhone } from "@/lib/admission/phone";
import { segmentLabel } from "@/lib/leads/status";
import { telLink } from "@/lib/leads/templates";
import { annuaireUrl, frDate, mapsSearchUrl, type ProspectRow } from "@/lib/prospection/queries";
import { CALL_OUTCOMES, nextWorkingDay, prospectStatusBadgeClass, prospectStatusLabel, type CallOutcome } from "@/lib/prospection/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CallLine = { id: string; when: string; who: string | null; outcome: string; note: string | null };

const OUTCOME_STYLE: Record<CallOutcome, string> = {
  pas_de_reponse: "",
  barrage: "border-amber-300",
  rappeler: "border-sky-300",
  interesse: "border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  pas_de_besoin: "",
  numero_faux: "",
  ne_plus_appeler: "border-red-300 text-red-700",
};

// L'écran d'appel : le restaurant, l'accroche, un bouton par résultat. « Pas de réponse »
// s'enregistre en un tap ; les autres demandent au plus une date et une phrase.
export function CallPanel({
  prospect: p,
  calls,
  listId,
  today,
  setterFirstName,
  progress,
  skipHref,
  nextHref,
  owners,
  listName,
}: {
  owners: Owner[];
  listName: string;
  prospect: ProspectRow;
  calls: CallLine[];
  listId: string;
  today: string;
  setterFirstName: string | null;
  progress: string;
  skipHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [callbackOn, setCallbackOn] = useState(nextWorkingDay(today));
  const [phone, setPhone] = useState(p.phone ?? "");
  const tel = telLink(p.phone);
  const annuaire = annuaireUrl(p.siret);
  const firstCall = p.attempts === 0;

  function save(o: CallOutcome) {
    startTransition(async () => {
      const r = await logProspectCall({
        prospectId: p.id,
        outcome: o,
        note: note || null,
        callbackOn: o === "rappeler" || o === "barrage" ? callbackOn : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.leadId) {
        toast.success("Lead créé : qualifiez le besoin et posez le RDV.");
        router.push(`/leads/${r.leadId}`);
        return;
      }
      toast.success(`${p.company} : ${CALL_OUTCOMES.find((x) => x.code === o)?.label.replace("…", "")}`);
      router.push(nextHref);
    });
  }

  function choose(o: CallOutcome) {
    if (o === "pas_de_reponse") return save(o);
    if (o === "interesse") return setQualifyOpen(true);
    setOutcome(o);
  }

  // « Intéressé » : la fiche de qualification s'ouvre, pré-remplie avec le restaurant ;
  // l'enregistrer crée le lead et ouvre sa fiche.
  const prefill: Partial<LeadRow> = {
    company: p.company,
    segment: p.segment,
    source: "prospection",
    campaign: listName,
    phone: p.phone,
    email: p.email,
    city: p.city,
    postal_code: p.postal_code,
    positions_count: 1,
    notes: [
      `Prospection${p.opened_on ? ` : restaurant ouvert le ${frDate(p.opened_on)}` : ""}.`,
      p.address ? `Adresse : ${p.address}` : null,
      p.siret ? `SIRET : ${p.siret}` : null,
      p.website ? `Site : ${p.website}` : null,
      p.notes,
    ].filter(Boolean).join("\n"),
  };

  function savePhone() {
    startTransition(async () => {
      const r = await updateProspectContact({ prospectId: p.id, phone: phone || null, email: p.email, notes: p.notes });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Numéro enregistré.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight">{p.company}</h1>
              <p className="text-sm text-muted-foreground">
                {segmentLabel(p.segment)} · ouvert le {frDate(p.opened_on)}
                {p.legal_name && p.legal_name !== p.company ? ` · ${p.legal_name}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className={prospectStatusBadgeClass(p.status)}>{prospectStatusLabel(p.status)}</Badge>
              <span className="text-xs text-muted-foreground">{progress}</span>
            </div>
          </div>

          {tel ? (
            <Button asChild size="lg" className="w-full text-lg">
              <a href={tel}><Phone className="mr-2 h-5 w-5" />{formatPhone(p.phone)}</a>
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-sm">
                Pas de numéro.{" "}
                <a href={mapsSearchUrl(p)} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  Le chercher sur Google Maps
                </a>
                , puis l&apos;enregistrer :
              </p>
              <div className="flex gap-2">
                <Input id="prospect-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 23 45 67 89" inputMode="tel" />
                <Button onClick={savePhone} disabled={pending || !phone.trim()}>Enregistrer</Button>
              </div>
            </div>
          )}

          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{[p.address, [p.postal_code, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</span>
            </div>
            {p.email && <div className="truncate">{p.email}</div>}
            <div className="flex flex-wrap gap-x-3 text-xs">
              {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="underline">Site<ExternalLink className="ml-0.5 inline h-3 w-3" /></a>}
              <a href={mapsSearchUrl(p)} target="_blank" rel="noopener noreferrer" className="underline">Google Maps<ExternalLink className="ml-0.5 inline h-3 w-3" /></a>
              {annuaire && <a href={annuaire} target="_blank" rel="noopener noreferrer" className="underline">Fiche entreprise<ExternalLink className="ml-0.5 inline h-3 w-3" /></a>}
            </div>
          </dl>
          {p.callback_note && (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">Rappel prévu le {frDate(p.callback_on)} : {p.callback_note}</p>
          )}
          {p.notes && <p className="whitespace-pre-line text-xs text-muted-foreground">{p.notes}</p>}
        </CardContent>
      </Card>

      <details className="rounded-md border bg-background px-4 py-2 text-sm" open={firstCall}>
        <summary className="cursor-pointer font-medium">Accroche</summary>
        <div className="space-y-2 py-2 text-muted-foreground">
          <p>
            « Bonjour, {setterFirstName ?? "[prénom]"} de ParlerEmploi, un centre de formation à Saint-Ouen. Je cherche à parler au gérant
            de {p.company}. » <em>(Barrage : demander son prénom et le meilleur moment pour le joindre, hors service.)</em>
          </p>
          <p>
            Au gérant : « Vous avez ouvert{p.opened_on ? ` en ${new Date(`${p.opened_on}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}` : " récemment"}, félicitations.
            Vous cherchez du monde en cuisine ou en salle en ce moment ? Nous formons des candidats sur vos postes avant l&apos;embauche,
            avec un financement France Travail : vous recrutez quelqu&apos;un de déjà préparé. »
          </p>
          <p>S&apos;il recrute → « Intéressé » : le lead se crée et vous le qualifiez avec les 7 questions habituelles.</p>
          <p className="text-xs">S&apos;il demande d&apos;où vient son numéro : de l&apos;annuaire public des entreprises et de sa fiche en ligne. S&apos;il refuse d&apos;être rappelé : « Ne plus appeler ».</p>
        </div>
      </details>

      {outcome === null ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CALL_OUTCOMES.map((o) => (
            <Button
              key={o.code}
              variant="outline"
              className={cn("h-auto min-h-12 whitespace-normal py-2", OUTCOME_STYLE[o.code], o.code === "interesse" && "col-span-2 sm:col-span-1")}
              title={o.hint}
              disabled={pending || (!tel && o.code !== "numero_faux")}
              onClick={() => choose(o.code)}
            >
              {o.label}
            </Button>
          ))}
          <Button asChild variant="ghost" className="min-h-12">
            <Link href={skipHref}><SkipForward className="mr-2 h-4 w-4" />Passer</Link>
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="font-medium">{CALL_OUTCOMES.find((x) => x.code === outcome)?.label.replace("…", "")}</p>
            {(outcome === "rappeler" || outcome === "barrage") && (
              <div className="space-y-1">
                <Label htmlFor="prospect-callback">Rappeler le</Label>
                <Input id="prospect-callback" type="date" min={today} value={callbackOn} onChange={(e) => setCallbackOn(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="prospect-note">
                {outcome === "barrage" ? "Prénom du gérant, meilleur moment" : "Note (facultatif)"}
              </Label>
              <Textarea id="prospect-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOutcome(null)} disabled={pending}>Retour</Button>
              <Button onClick={() => save(outcome)} disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer et suivant"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <LeadFormDialog
        owners={owners}
        prefill={prefill}
        title={`Qualification — ${p.company}`}
        open={qualifyOpen}
        onOpenChange={setQualifyOpen}
        onCreate={(lead) => qualifyProspect({ prospectId: p.id, lead })}
      />

      {calls.length > 0 && (
        <div className="rounded-md border bg-background px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Appels précédents</p>
          <ul className="divide-y text-sm">
            {calls.map((c) => (
              <li key={c.id} className="py-1.5">
                <span className="font-medium">{c.outcome}</span>
                <span className="text-xs text-muted-foreground"> · {c.when}{c.who ? ` · ${c.who}` : ""}</span>
                {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        <Link href={`/prospection/${listId}`} className="underline">Voir toute la liste</Link>
      </p>
    </div>
  );
}

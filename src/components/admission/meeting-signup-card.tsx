"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";
import { setMeetingSignupOpen } from "@/app/(app)/apprenants/admission/actions";
import { ORG_NAME, renderTemplate } from "@/lib/admission/templates";
import { whatsappShareUrl } from "@/lib/inscription/link";
import { buildMeetingSms } from "@/lib/inscription/link-queue";
import { buildMeetingSignupUrl, oralTestSentence, placesLeft, placesSummary } from "@/lib/inscription/meeting";
import { MeetingLinkQueue } from "@/components/admission/meeting-link-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Carte « Inscription par lien » de la page d'une réunion : état, places prises sur le nombre
// maximum, lien public à copier, message WhatsApp prêt (modèle « Lien d'inscription à une
// réunion d'information »), ouverture et fermeture en un clic. Les inscrits arrivent dans la
// liste des convoqués, déjà « confirmés ».

const FALLBACK_ORIGIN = "https://pef-erp.vercel.app";

export function MeetingSignupCard({
  meetingId,
  token,
  template,
  signupOpen,
  capacity,
  taken,
  waiting = 0,
  onlineCount,
  started,
  whenText,
  startsAts = [],
  place,
  oralTest,
  slotCount = 1,
  proposedCount = 0,
  staggerText = null,
}: {
  meetingId: string;
  token: string;
  template: string;
  signupOpen: boolean;
  capacity: number | null;
  taken: number; // personnes qui occupent une place : confirmées ou présentes (premier inscrit, premier servi)
  waiting?: number; // convoquées sans réponse (à envoyer, envoyée) : elles ne prennent pas de place
  onlineCount: number; // dont inscrits par le lien
  started: boolean; // la réunion a déjà commencé
  whenText: string;
  startsAts?: string[]; // débuts des sessions proposées par le lien (SMS court)
  place: string | null;
  oralTest: boolean;
  slotCount?: number; // créneaux du même lien (1 = réunion seule)
  proposedCount?: number; // dont proposés en ce moment sur la page du lien
  staggerText?: string | null; // phrase de l'accueil échelonné ({heure_passage})
}) {
  const [src, setSrc] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const origin = typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN;
  const link = buildMeetingSignupUrl(origin, token, src);
  const message = renderTemplate(template, {
    organisme: ORG_NAME,
    date: whenText,
    heure_passage: staggerText,
    lieu: place,
    test_oral: oralTestSentence(oralTest),
    lien_inscription: link,
  });
  const smsMessage = buildMeetingSms({ startsAts, link, oralTest });

  const left = placesLeft(capacity, taken);
  const full = left === 0;
  const state = started
    ? { label: "Réunion passée", className: "border-gray-300 bg-gray-100 text-gray-600" }
    : !signupOpen
      ? { label: "Fermée", className: "border-gray-300 bg-gray-100 text-gray-600" }
      : full
        ? { label: "Complète", className: "border-orange-300 bg-orange-50 text-orange-800" }
        : { label: "Ouverte", className: "border-emerald-300 bg-emerald-50 text-emerald-800" };

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copié`);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  function toggle() {
    startTransition(async () => {
      const result = await setMeetingSignupOpen({ meetingId, open: !signupOpen });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const n = result.count ?? 1;
      const scope = n > 1 ? ` (${n} créneaux)` : "";
      toast.success(signupOpen ? `Inscription par lien fermée${scope}.` : `Inscription par lien ouverte${scope}.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Inscription par lien
            <Badge variant="outline" className={state.className}>{state.label}</Badge>
          </CardTitle>
          {!started && (
            <Button size="sm" variant={signupOpen ? "outline" : "default"} onClick={toggle} disabled={pending}>
              {signupOpen ? "Fermer l'inscription" : "Ouvrir l'inscription"}
              {slotCount > 1 ? ` (${slotCount} créneaux)` : ""}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          La personne remplit le formulaire court (2 minutes) et est inscrite d&apos;office, dans la limite des places : premier inscrit, premier servi. Elle apparaît ci-dessous comme confirmée, le statut d&apos;admission passe à « convoqué ». Une convocation sans réponse ne prend pas de place.
          {oralTest ? " Le test oral individuel lui est annoncé." : ""}
        </p>
        {slotCount > 1 && (
          <p className="text-xs font-medium">
            Lien commun à {slotCount} créneaux : {proposedCount} proposé{proposedCount > 1 ? "s" : ""} en ce moment
            {proposedCount < 2 ? " — la personne n'aura pas de choix (voir l'état de chaque créneau ci-dessous)" : " — la personne choisit son jour"}.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {capacity ? placesSummary(capacity, taken) : `${taken} inscrit${taken > 1 ? "s" : ""} · pas de maximum`}
            </span>
            <span className="text-xs text-muted-foreground">
              dont {onlineCount} par le lien{waiting > 0 ? ` · ${waiting} convoqué${waiting > 1 ? "s" : ""} sans réponse (sans place réservée)` : ""}
            </span>
          </div>
          {capacity ? (
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className={full ? "h-full rounded-full bg-orange-500" : "h-full rounded-full bg-emerald-600"}
                style={{ width: `${Math.min(100, Math.round((taken / capacity) * 100))}%` }}
              />
            </div>
          ) : (
            <p className="text-xs text-destructive">Aucun maximum de places : « Modifier » pour le fixer (obligatoire pour ouvrir le lien).</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="meeting-signup-src">Provenance (facultatif)</Label>
          <Input
            id="meeting-signup-src"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder="MDQ Landy, CCAS, Mission locale…"
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="meeting-signup-link">Lien</Label>
          <div className="flex gap-2">
            <Input id="meeting-signup-link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={() => copy(link, "Lien")} aria-label="Copier le lien">
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" asChild aria-label="Ouvrir la page d'inscription">
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          {!signupOpen && !started && (
            <p className="text-xs text-muted-foreground">Inscription fermée : le lien affiche « Inscription fermée » tant que vous ne l&apos;ouvrez pas.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Message WhatsApp</Label>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{message}</pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => copy(message, "Message")}>
              <Copy className="mr-1 h-4 w-4" />
              Copier le message
            </Button>
            <Button type="button" size="sm" asChild className="bg-emerald-700 text-white hover:bg-emerald-800">
              <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" />
                Ouvrir WhatsApp
              </a>
            </Button>
            <MeetingLinkQueue meetingId={meetingId} message={message} smsMessage={smsMessage} disabled={!signupOpen || started} />
          </div>
          <p className="text-xs text-muted-foreground">
            WhatsApp s&apos;ouvre avec le message : choisissez la personne ou le groupe. Texte modifiable dans « Messages » (étape « Lien d&apos;inscription à une réunion d&apos;information »).
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>SMS court (gratuit, depuis le téléphone)</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copy(smsMessage, "SMS")}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copier le SMS
            </Button>
          </div>
          <p className="rounded-md border bg-muted/40 p-2 text-xs">{smsMessage}</p>
          <p className="text-xs text-muted-foreground">
            Pour qui n&apos;a pas WhatsApp : dans « Envoyer aux convoqués, un par un », ouvert sur le téléphone, le bouton « SMS » ouvre Messages avec ce texte et le numéro. C&apos;est le forfait du téléphone qui paie.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

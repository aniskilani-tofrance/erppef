"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Contact, Download, Smartphone } from "lucide-react";
import { createContactsPhoneLink } from "@/app/(app)/groupes/[id]/contacts/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ContactLine = { name: string; phone: string };

// Contacts du groupe pour le répertoire du téléphone (.vcf) : tout le groupe, ou
// seulement les nouveaux depuis mon dernier import, téléchargé ici ou sur le téléphone
// via un QR code à usage unique. Le fichier est une copie : les départs sont listés à
// part, à retirer à la main.
export function GroupContactsCard({
  groupId,
  total,
  newCount,
  imported,
  lastImportOn,
  noPhone,
  toRemove,
}: {
  groupId: string;
  total: number; // inscrits avec un numéro exploitable
  newCount: number; // jamais importés par moi
  imported: boolean; // ai-je déjà importé ce groupe ?
  lastImportOn: string | null;
  noPhone: string[];
  toRemove: ContactLine[];
}) {
  const [qr, setQr] = useState<{ dataUrl: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const href = (mode: "tout" | "nouveaux") => `/groupes/${groupId}/contacts?mode=${mode}`;

  function phoneLink(mode: "tout" | "nouveaux") {
    startTransition(async () => {
      const r = await createContactsPhoneLink(groupId, mode);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const dataUrl = await QRCode.toDataURL(r.url, { width: 220, margin: 1 });
      const until = new Date(r.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      setQr({ dataUrl, label: `${mode === "nouveaux" ? "Nouveaux contacts" : "Tout le groupe"} — valable une fois, jusqu'à ${until}` });
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Contact className="h-4 w-4" />
          Contacts du groupe pour votre téléphone
          {imported && newCount > 0 && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">{newCount} nouveau{newCount > 1 ? "x" : ""}</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Un fichier de contacts (.vcf) avec les inscrits du groupe : enregistrés sous « Prénom NOM · G-n », ils se retrouvent en tapant le numéro du groupe. Indispensable pour les ajouter au groupe WhatsApp de la classe.
          {imported && lastImportOn ? ` Votre dernier import : ${lastImportOn}.` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun inscrit avec un numéro de téléphone exploitable pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {imported && (
              <Button asChild size="sm" disabled={newCount === 0} variant={newCount > 0 ? "default" : "outline"}>
                <a href={newCount > 0 ? href("nouveaux") : undefined} aria-disabled={newCount === 0}>
                  <Download className="mr-1 h-4 w-4" />
                  Nouveaux depuis mon dernier import ({newCount})
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant={imported ? "outline" : "default"}>
              <a href={href("tout")}>
                <Download className="mr-1 h-4 w-4" />
                Tout le groupe ({total})
              </a>
            </Button>
            <Button size="sm" variant="outline" disabled={pending || (imported && newCount === 0)} onClick={() => phoneLink(imported ? "nouveaux" : "tout")}>
              <Smartphone className="mr-1 h-4 w-4" />
              {pending ? "Préparation…" : "Ouvrir sur mon téléphone"}
            </Button>
          </div>
        )}

        {qr && (
          <div className="flex flex-wrap items-start gap-4 rounded-md border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.dataUrl} alt="QR code du fichier de contacts" className="h-36 w-36 rounded border bg-white" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="font-medium">{qr.label}</p>
              <p className="text-muted-foreground">Scannez avec l&apos;appareil photo du téléphone, puis :</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                <li>iPhone : « Ajouter les contacts » ;</li>
                <li>Android : ouvrir le fichier avec Contacts → « Importer ».</li>
              </ul>
            </div>
          </div>
        )}

        {imported && total > 0 && newCount === 0 && (
          <p className="text-xs text-muted-foreground">Votre téléphone est à jour : aucun nouvel inscrit depuis votre dernier import. Évitez « Tout le groupe » une seconde fois, sinon l&apos;iPhone crée des doublons.</p>
        )}

        {toRemove.length > 0 && (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
            <p className="font-medium text-orange-900">À retirer de vos contacts ({toRemove.length})</p>
            <p className="text-xs text-orange-900/80">Importés par vous, ils ne sont plus inscrits (abandon, fin de parcours). Le fichier ne peut pas les effacer : supprimez-les à la main.</p>
            <ul className="mt-1 space-y-0.5">
              {toRemove.map((r) => (
                <li key={`${r.name}${r.phone}`}>{r.name} <span className="text-muted-foreground">— {r.phone}</span></li>
              ))}
            </ul>
          </div>
        )}

        {noPhone.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sans numéro exploitable, donc absents du fichier : {noPhone.join(", ")}. Complétez leur fiche.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Ces numéros sont des données personnelles : à garder pour les besoins du cours, à supprimer de votre téléphone à la fin du groupe. Chaque import est enregistré.
        </p>
      </CardContent>
    </Card>
  );
}

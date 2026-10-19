"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";
import { buildSignupMessage, buildSignupUrl, whatsappShareUrl } from "@/lib/inscription/link";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Lien d'inscription rapide (/inscription) à envoyer sur WhatsApp : à une personne qui
// demande des cours, ou dans un groupe (maison de quartier, partenaire…). La provenance
// facultative part dans le lien (?src=) et s'affiche ensuite sous le nom, dans Admission.
// Le texte du message est le modèle « Lien d'inscription rapide » (onglet Messages).

const FALLBACK_ORIGIN = "https://pef-erp.vercel.app";

export function SignupLinkButton({ template }: { template: string }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN;
  const link = buildSignupUrl(origin, src);
  const message = buildSignupMessage(template, link);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copié`);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="mr-1 h-4 w-4" />
          Lien d&apos;inscription
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lien d&apos;inscription rapide</DialogTitle>
          <DialogDescription>
            Formulaire court, en français facile, anglais ou arabe. Les inscrits arrivent dans « À contacter ».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="signup-src">Provenance (facultatif)</Label>
            <Input
              id="signup-src"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder="MDQ Landy, CCAS, Mission locale…"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              « MDQ … » est rangé en Maison de quartier, « France Travail », « CCAS », « Mission locale » en prescripteur ; sinon « Formulaire en ligne ».
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-link">Lien</Label>
            <div className="flex gap-2">
              <Input id="signup-link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={() => copy(link, "Lien")} aria-label="Copier le lien">
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" asChild aria-label="Ouvrir le formulaire">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
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
            </div>
            <p className="text-xs text-muted-foreground">
              WhatsApp s&apos;ouvre avec le message : choisissez la personne ou le groupe. Texte modifiable dans « Messages ».
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

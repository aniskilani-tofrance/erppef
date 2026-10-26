"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// « Copier le lien » sur la ligne d'un convoqué : le lien PERSONNEL de son test de niveau (créé pour
// sa fiche, son résultat remplit le niveau de cette personne). Pour l'envoyer à part, ou le recoller
// à quelqu'un dont la convocation est partie avant que le lien soit ajouté aux messages.
export function CopyTestLinkButton({ url, learnerName }: { url: string; learnerName: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Lien du test de ${learnerName} copié`);
    } catch {
      toast.error("Copie impossible : ouvrez la convocation WhatsApp, le lien y est.");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      className="h-6 px-1.5 text-xs font-normal"
      title={`Copier le lien personnel du test de niveau de ${learnerName}`}
      aria-label={`Copier le lien du test de niveau de ${learnerName}`}
    >
      <Copy className="mr-1 h-3 w-3" />
      Copier le lien
    </Button>
  );
}

"use client";

import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WhatsAppGroupActions({ url }: { url: string }) {
  return (
    <span className="inline-flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="h-8" onClick={() => { navigator.clipboard.writeText(url); toast.success("Lien d'invitation copié."); }}>
        <Copy className="mr-1 h-3.5 w-3.5" />
        Copier le lien
      </Button>
      <Button variant="ghost" size="sm" className="h-8" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          Ouvrir
        </a>
      </Button>
    </span>
  );
}

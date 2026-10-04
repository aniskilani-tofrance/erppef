"use client";

import { useRef, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  confirmKitUpload, createKitUploadUrl, deleteSessionKit, getKitDownloadUrl, getSessionKit,
} from "@/app/(app)/planning/kit-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { KIT_BUCKET, KIT_MAX_BYTES } from "@/lib/kits";

// Bloc « Kit de séance » de la fiche séance : téléchargement pour le formateur de la séance,
// dépôt / remplacement / suppression pour la coordination. Rien ne s'affiche pour les autres.
export function SessionKit({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const { data: info, isLoading } = useQuery({
    queryKey: ["session-kit", sessionId],
    queryFn: () => getSessionKit(sessionId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["session-kit", sessionId] });

  if (isLoading || !info || (!info.canDownload && !info.canManage)) return null;
  const kit = info.kit;

  function download() {
    startTransition(async () => {
      const r = await getKitDownloadUrl(sessionId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      window.location.assign(r.url);
    });
  }

  function upload(file: File) {
    if (!/\.pdf$/i.test(file.name) || file.size > KIT_MAX_BYTES) {
      toast.error("Le kit doit être un PDF de 30 Mo maximum.");
      return;
    }
    startTransition(async () => {
      const input = { sessionId, fileName: file.name, sizeBytes: file.size };
      const prep = await createKitUploadUrl(input);
      if (!prep.ok) {
        toast.error(prep.error);
        return;
      }
      const { error } = await createClient()
        .storage.from(KIT_BUCKET)
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: "application/pdf", upsert: true });
      if (error) {
        toast.error("L'envoi du PDF a échoué.");
        return;
      }
      const done = await confirmKitUpload(input);
      if (!done.ok) {
        toast.error(done.error);
        return;
      }
      toast.success(kit ? "Kit remplacé." : "Kit déposé.");
      refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteSessionKit(sessionId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Kit supprimé.");
      refresh();
    });
  }

  const detail = kit
    ? [kit.level, kit.sequenceNo && kit.seanceNo ? `séquence ${kit.sequenceNo} · séance ${kit.seanceNo}` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label>Kit de séance</Label>
      {kit ? (
        <>
          <p className="text-sm">
            {kit.fileName}
            {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
          </p>
          <Button onClick={download} disabled={pending} className="w-full">
            {pending ? "Préparation…" : "Télécharger le kit (PDF)"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun kit déposé pour cette séance.</p>
      )}
      {info.canManage && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }}
          />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()} className="flex-1">
            {kit ? "Remplacer le kit" : "Déposer le kit"}
          </Button>
          {kit && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
              Supprimer
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Réservé à l&apos;équipe : jamais visible des apprenants.</p>
    </div>
  );
}

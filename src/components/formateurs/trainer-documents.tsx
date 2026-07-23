"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Trash2, Upload } from "lucide-react";
import { addTrainerDocument, deleteTrainerDocument } from "@/app/(app)/formateurs/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TrainerDocument = {
  id: string;
  label: string;
  signedUrl: string | null;
};

// CV, diplômes, attestations de formation continue (Qualiopi ind. 21-22).
// Bucket privé : les liens de consultation sont signés et temporaires.
export function TrainerDocuments({
  trainerId,
  documents,
}: {
  trainerId: string;
  documents: TrainerDocument[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop lourd (10 Mo maximum).");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `formateurs/${trainerId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from("documents").upload(path, file);
      if (error) throw new Error(error.message);

      const result = await addTrainerDocument({
        trainerId,
        label: label.trim() || file.name,
        filePath: path,
      });
      if (!result.ok) throw new Error(result.error);
      toast.success("Document ajouté au dossier du formateur.");
      setLabel("");
    } catch (e) {
      toast.error(`Ajout impossible : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setBusy(false);
    }
  }

  function remove(doc: TrainerDocument) {
    startTransition(async () => {
      const result = await deleteTrainerDocument(doc.id, trainerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Document supprimé.");
    });
  }

  return (
    <div className="space-y-4">
      {documents.length > 0 ? (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              {d.signedUrl ? (
                <a href={d.signedUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {d.label}
                </a>
              ) : (
                <span className="font-medium">{d.label}</span>
              )}
              <Button
                variant="ghost" size="icon" className="ml-auto h-6 w-6"
                onClick={() => remove(d)} disabled={pending}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun document. Ajoutez CV, diplômes et attestations de formation continue :
          c&apos;est la preuve des indicateurs 21-22 en audit.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-2">
          <Label>Intitulé</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CV, Master FLE, attestation…" className="w-56" />
        </div>
        <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          {busy ? "Envoi…" : "Ajouter un fichier"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

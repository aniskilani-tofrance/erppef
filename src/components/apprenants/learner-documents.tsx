"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ExternalLink, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import {
  addLearnerDocument,
  deleteLearnerDocument,
  listLearnerDocuments,
  type LearnerDocumentRow,
} from "@/app/(app)/apprenants/actions";
import { createClient } from "@/lib/supabase/client";
import {
  DOCUMENT_SLOTS,
  checkDocumentFile,
  defaultLabel,
  documentExtension,
  documentStoragePath,
  dossierCompleteness,
  isImageMime,
  type LearnerDocumentKind,
} from "@/lib/dossier/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Dossier administratif : pièce d'identité recto/verso, justificatif de domicile, autres.
// Le fichier part du navigateur vers le bucket privé « dossiers » (pas de passage par le
// serveur : pas de limite de taille de requête), puis la pièce est enregistrée par action.
// Sur téléphone, « Photo / scan » ouvre directement l'appareil photo ; « Fichier » ouvre le
// sélecteur, où l'iPhone propose « Scanner des documents » (PDF net et redressé).

const MAX_SIDE = 2000; // px : lisible pour une pièce d'identité, léger à stocker

export function LearnerDocuments({ learnerId }: { learnerId: string }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LearnerDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<LearnerDocumentKind | null>(null);
  const [otherLabel, setOtherLabel] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<LearnerDocumentKind>("autre");

  const apply = useCallback((result: Awaited<ReturnType<typeof listLearnerDocuments>>) => {
    if (!result.ok) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    setOrgId(result.orgId);
    setDocuments(result.documents);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => listLearnerDocuments(learnerId).then(apply), [learnerId, apply]);

  // Chargement à l'ouverture de la fiche (liens signés) ; ignoré si la fiche se ferme entre-temps.
  useEffect(() => {
    let cancelled = false;
    listLearnerDocuments(learnerId).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [learnerId, apply]);

  function pick(kind: LearnerDocumentKind, source: "camera" | "file") {
    pendingKind.current = kind;
    (source === "camera" ? cameraRef : fileRef).current?.click();
  }

  async function handleFile(file: File) {
    const kind = pendingKind.current;
    const problem = checkDocumentFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!orgId) {
      toast.error("Dossier non chargé, réessayez.");
      return;
    }
    setBusyKind(kind);
    try {
      const { blob, mime, ext } = await prepareUpload(file);
      const path = documentStoragePath(orgId, learnerId, kind, ext, crypto.randomUUID());
      const { error } = await createClient().storage.from("dossiers").upload(path, blob, { contentType: mime, upsert: false });
      if (error) throw new Error(error.message);

      const label = kind === "autre" && otherLabel.trim() ? otherLabel.trim() : defaultLabel(kind, file.name);
      const result = await addLearnerDocument({ learnerId, kind, label, filePath: path, mimeType: mime, sizeBytes: blob.size });
      if (!result.ok) throw new Error(result.error);
      toast.success(kind === "autre" ? "Document ajouté au dossier." : `${label} enregistrée.`);
      setOtherLabel("");
      await refresh();
    } catch (e) {
      toast.error(`Ajout impossible : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setBusyKind(null);
    }
  }

  async function remove(doc: LearnerDocumentRow) {
    if (!confirm(`Supprimer « ${doc.label} » du dossier ?`)) return;
    const result = await deleteLearnerDocument(doc.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Pièce supprimée.");
    await refresh();
  }

  const progress = dossierCompleteness(documents);
  const others = documents.filter((d) => d.kind === "autre");

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          Dossier administratif{" "}
          <span className="font-normal text-muted-foreground">(pièces scannées ou déposées)</span>
        </p>
        {!loading && (
          <span className={`text-xs font-medium ${progress.done === progress.total ? "text-emerald-700" : "text-muted-foreground"}`}>
            {progress.done} / {progress.total} pièces
          </span>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du dossier…
        </p>
      ) : (
        <div className="space-y-2">
          {DOCUMENT_SLOTS.map((slot) => {
            const doc = documents.find((d) => d.kind === slot.kind);
            const busy = busyKind === slot.kind;
            return (
              <div key={slot.kind} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <Preview doc={doc} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{slot.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc ? `Ajoutée le ${new Date(doc.createdAt).toLocaleDateString("fr-FR")}` : slot.hint}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {doc?.signedUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Voir
                      </a>
                    </Button>
                  )}
                  <Button variant={doc ? "ghost" : "outline"} size="sm" disabled={busy} onClick={() => pick(slot.kind, "camera")} title="Prendre en photo ou scanner">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    <span className="ml-1 hidden sm:inline">{doc ? "Refaire" : "Photo / scan"}</span>
                  </Button>
                  <Button variant={doc ? "ghost" : "outline"} size="sm" disabled={busy} onClick={() => pick(slot.kind, "file")} title="Choisir un fichier (PDF ou image)">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden sm:inline">Fichier</span>
                  </Button>
                  {doc && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(doc)} title="Supprimer">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="rounded-md border px-3 py-2">
            <p className="text-sm font-medium leading-tight">Autres documents</p>
            <p className="text-xs text-muted-foreground">Titre de séjour, attestation France Travail, RIB, diplôme…</p>
            {others.length > 0 && (
              <ul className="mt-2 space-y-1">
                {others.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 text-sm">
                    <Preview doc={doc} small />
                    {doc.signedUrl ? (
                      <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {doc.label}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-medium">{doc.label}</span>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(doc)} title="Supprimer">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder="Intitulé (ex. Titre de séjour)"
                className="h-8 w-52"
              />
              <Button variant="outline" size="sm" disabled={busyKind === "autre"} onClick={() => pick("autre", "camera")}>
                {busyKind === "autre" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                <span className="ml-1">Photo / scan</span>
              </Button>
              <Button variant="outline" size="sm" disabled={busyKind === "autre"} onClick={() => pick("autre", "file")}>
                <Paperclip className="h-3.5 w-3.5" />
                <span className="ml-1">Fichier</span>
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Sur iPhone : « Fichier » → « Choisir un fichier » → ⋯ → « Scanner des documents » donne un PDF net et redressé ;
            « Photo / scan » ouvre l&apos;appareil photo. Les photos sont réduites avant envoi. Accès réservé à la
            coordination, liens de consultation valables 1 h, suppression avec la fiche.
          </p>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Preview({ doc, small }: { doc?: LearnerDocumentRow; small?: boolean }) {
  const size = small ? "h-6 w-6" : "h-10 w-10";
  if (doc?.signedUrl && doc.mimeType && isImageMime(doc.mimeType)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={doc.signedUrl} alt="" className={`${size} shrink-0 rounded object-cover`} />;
  }
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground`}>
      <FileText className={small ? "h-3.5 w-3.5" : "h-5 w-5"} />
    </div>
  );
}

// Photo : réduite à 2000 px de côté max et exportée en JPEG ; PDF (ou image non décodable,
// par exemple HEIC sur un navigateur qui ne le lit pas) : envoyé tel quel.
async function prepareUpload(file: File): Promise<{ blob: Blob; mime: string; ext: string }> {
  const mime = file.type.toLowerCase();
  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return { blob: file, mime: "application/pdf", ext: "pdf" };
  }
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("conversion impossible"))), "image/jpeg", 0.85);
    });
    return { blob, mime: "image/jpeg", ext: "jpg" };
  } catch {
    return { blob: file, mime: mime || "application/octet-stream", ext: documentExtension(file) };
  }
}

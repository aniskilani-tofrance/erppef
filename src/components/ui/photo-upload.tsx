"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Upload d'une photo de profil : recadrée en carré et compressée côté navigateur
// (~30 Ko), stockée dans le bucket public « photos ».
// « Prendre une photo » ouvre une VRAIE caméra dans l'app (webcam comprise, donc
// aussi sur ordinateur) ; si la caméra est indisponible ou refusée, repli sur
// l'appareil photo du système (mobile) ou le sélecteur de fichiers.
export function PhotoUpload({
  url,
  fallback,
  folder,
  onChange,
}: {
  url: string | null;
  fallback: string; // initiales
  folder: "formateurs" | "apprenants";
  onChange: (url: string | null) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState(false);
  // Le flux vit dans l'état (pas dans une ref) : la balise <video> du dialog est montée APRÈS
  // l'ouverture, et c'est le callback ref ci-dessous qui branche le flux dès qu'elle existe.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const cameraOpen = stream !== null;

  async function handleFile(file: File | Blob) {
    setBusy(true);
    try {
      const resized = await resizeSquare(file, 512);
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("photos").upload(path, resized, {
        contentType: "image/jpeg",
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      toast.error(`Photo impossible à charger : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setBusy(false);
    }
  }

  async function openCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click(); // repli : caméra du système (mobile) ou sélecteur
      return;
    }
    // Caméra frontale en priorité ; si les contraintes ne passent pas (webcam de bureau,
    // ancien navigateur), on retente sans contrainte avant de renoncer.
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: "user", width: { ideal: 1024 }, height: { ideal: 1024 } }, audio: false },
      { video: true, audio: false },
    ];
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(s);
        return;
      } catch (e) {
        lastError = e;
        if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) break;
      }
    }
    const name = lastError instanceof DOMException ? lastError.name : "";
    toast.error(
      name === "NotAllowedError"
        ? "Caméra refusée par le navigateur : autorisez-la (icône caméra dans la barre d'adresse), ou choisissez une photo."
        : "Caméra indisponible sur cet appareil : choisissez une photo à la place.",
    );
    cameraInputRef.current?.click();
  }

  function closeCamera() {
    setStream(null); // l'effet ci-dessous coupe les pistes
  }

  // Branche le flux sur la balise <video> dès qu'elle est montée dans le dialog, et
  // force la lecture (autoplay ne suffit pas toujours quand la source arrive après le montage).
  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el && stream) {
        el.srcObject = stream;
        el.play().catch(() => {
          /* la lecture repart sur loadedmetadata */
        });
      }
    },
    [stream],
  );

  // Coupe les pistes quand le flux change (fermeture) ou quand le composant disparaît :
  // la LED de la caméra ne reste jamais allumée.
  useEffect(() => {
    if (!stream) return;
    return () => stream.getTracks().forEach((t) => t.stop());
  }, [stream]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        closeCamera();
        if (blob) handleFile(blob);
        else toast.error("Capture impossible, réessayez.");
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-16 w-16">
        {url && <AvatarImage src={url} alt="" className="object-cover" />}
        <AvatarFallback className="text-lg">{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openCamera}>
          <Camera className="mr-2 h-3.5 w-3.5" />
          {busy ? "Chargement…" : "Prendre une photo"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="mr-2 h-3.5 w-3.5" />
          Importer
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
            <X className="mr-1 h-3.5 w-3.5" />
            Retirer
          </Button>
        )}
      </div>

      {/* Caméra intégrée (webcam / caméra frontale) */}
      <Dialog open={cameraOpen} onOpenChange={(o) => !o && closeCamera()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prendre une photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Miroir : plus naturel pour un portrait face caméra */}
            <video
              ref={attachVideo}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => e.currentTarget.play().catch(() => undefined)}
              className="aspect-square w-full rounded-lg bg-black object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <p className="text-center text-xs text-muted-foreground">
              Image noire ? Autorisez la caméra dans le navigateur, ou{" "}
              <button type="button" className="underline" onClick={() => { closeCamera(); cameraInputRef.current?.click(); }}>
                choisissez une photo
              </button>
              .
            </p>
            <div className="flex justify-center gap-2">
              <Button type="button" variant="outline" onClick={closeCamera}>
                Annuler
              </Button>
              <Button type="button" onClick={capture}>
                <Camera className="mr-2 h-4 w-4" />
                Capturer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Replis : caméra du système (mobile) et sélecteur de fichiers */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// Recadre au centre en carré puis réduit à `size` px, export JPEG.
async function resizeSquare(file: File | Blob, size: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("conversion impossible"))),
      "image/jpeg",
      0.85,
    );
  });
}

// Initiales pour le fallback d'avatar.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

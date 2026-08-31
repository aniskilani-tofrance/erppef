"use client";

import { useEffect, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

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
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click(); // repli : caméra du système (mobile) ou sélecteur
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1024 }, height: { ideal: 1024 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      // Permission refusée ou pas de caméra → repli système
      cameraInputRef.current?.click();
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  // Brancher le flux sur la balise vidéo quand le dialog est monté
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
    return () => {
      if (!cameraOpen) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOpen]);

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
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-square w-full rounded-lg bg-black object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
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

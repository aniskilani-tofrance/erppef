"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// Upload d'une photo de profil : recadrée en carré et compressée côté navigateur
// (~30 Ko), stockée dans le bucket public « photos ».
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
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

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-16 w-16">
        {url && <AvatarImage src={url} alt="" className="object-cover" />}
        <AvatarFallback className="text-lg">{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Camera className="mr-2 h-3.5 w-3.5" />
          {busy ? "Chargement…" : url ? "Changer la photo" : "Ajouter une photo"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
            <X className="mr-1 h-3.5 w-3.5" />
            Retirer
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
async function resizeSquare(file: File, size: number): Promise<Blob> {
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

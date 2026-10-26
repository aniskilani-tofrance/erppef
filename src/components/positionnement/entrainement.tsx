"use client";

// Entraînement à l'écran avant le bloc « lire et écrire » (non noté, repris de ToFrance) :
// toucher un rond, puis choisir une image. Deux échecs → test à refaire avec un accompagnant :
// on ne classe JAMAIS quelqu'un sur un échec de manipulation.
import { useEffect, useState } from "react";
import { lire } from "@/lib/positionnement/audio";

export function EntrainementLitteratie({ onFini, onAbandon }: { onFini: () => void; onAbandon: () => void }) {
  const [etape, setEtape] = useState<0 | 1>(0);
  const [echecs, setEchecs] = useState(0);

  // Consigne lue à l'arrivée sur chaque écran, relue toute seule toutes les 10 secondes.
  useEffect(() => {
    const texte = etape === 0 ? "Bonjour ! Touchez le rond vert." : "Touchez le ballon.";
    const t = window.setTimeout(() => lire(texte), 300);
    const r = window.setInterval(() => lire(texte), 10_000);
    return () => { window.clearTimeout(t); window.clearInterval(r); };
  }, [etape]);

  function choisir(e: string) {
    if (e === "⚽") { lire("Très bien !"); window.setTimeout(onFini, 900); return; }
    if (echecs + 1 >= 2) { lire("Merci ! Quelqu'un va vous aider pour la suite."); window.setTimeout(onAbandon, 1200); return; }
    setEchecs((n) => n + 1);
    lire("On recommence. Touchez le ballon.");
  }

  if (etape === 0) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-6">
        <button
          type="button"
          aria-label="Rond vert"
          className="h-48 w-48 rounded-full bg-[#32CF8A] shadow-xl ring-8 ring-[#32CF8A]/30 active:scale-95 motion-safe:animate-pulse"
          onClick={() => { lire("Très bien !"); window.setTimeout(() => setEtape(1), 800); }}
        />
      </main>
    );
  }
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="grid w-full max-w-md grid-cols-3 gap-4">
        {["⚽", "🌙", "🍎"].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => choisir(e)}
            className="flex aspect-square items-center justify-center rounded-2xl border-2 border-zinc-200 bg-white text-6xl shadow-sm active:scale-95"
          >
            {e}
          </button>
        ))}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Sparkles, X } from "lucide-react";

// Bandeau « Nouveau » qui défile en haut du Dashboard (et sur l'écran de connexion) :
// les dernières mises à jour, un clic ouvre la Formation. La croix masque le bandeau
// jusqu'à la prochaine nouveauté (mémorisé sur l'appareil). Pause au survol ; sans
// animation si le système demande moins de mouvement.

export type TickerItem = { id: string; date: string; title: string; summary: string; href: string };

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readDismissed(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function NewsTicker({
  items,
  dismissible = true,
  storageKey = "pef-news-dismissed",
  className = "",
}: {
  items: TickerItem[];
  dismissible?: boolean;
  storageKey?: string;
  className?: string;
}) {
  const latest = items[0]?.id ?? "";
  const dismissed = useSyncExternalStore(subscribe, () => readDismissed(storageKey), () => null);
  if (!items.length || (dismissible && dismissed === latest)) return null;

  // Vitesse constante : ~6 caractères par seconde, jamais moins de 25 s par tour
  const chars = items.reduce((n, i) => n + i.date.length + i.title.length + i.summary.length + 8, 0);
  const duration = Math.max(25, Math.round(chars / 6));

  function dismiss() {
    try {
      localStorage.setItem(storageKey, latest);
    } catch {
      // stockage indisponible : le bandeau restera visible, sans conséquence
    }
    listeners.forEach((l) => l());
  }

  const run = (copy: number) => (
    <span className="pef-ticker-run" aria-hidden={copy === 1}>
      {items.map((i) => (
        <Link key={`${i.id}-${copy}`} href={i.href} className="inline-flex items-center hover:underline" tabIndex={copy === 1 ? -1 : 0}>
          <b className="font-semibold">{i.date}</b>
          <span className="mx-1.5">—</span>
          <span className="font-medium">{i.title}</span>
          <span className="mx-1.5 text-muted-foreground">:</span>
          <span className="text-muted-foreground">{i.summary}</span>
          <span className="mx-8 text-primary">✦</span>
        </Link>
      ))}
    </span>
  );

  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm print:hidden ${className}`}
      role="region"
      aria-label="Nouveautés de l'outil"
    >
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
        <Sparkles className="h-3 w-3" />
        Nouveau
      </span>
      <div className="pef-ticker min-w-0 flex-1 overflow-hidden" style={{ ["--pef-ticker-duration" as string]: `${duration}s` }}>
        <div className="pef-ticker-track">
          {run(0)}
          {run(1)}
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          title="Masquer jusqu'à la prochaine nouveauté"
          aria-label="Masquer le bandeau des nouveautés"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <style>{`
        .pef-ticker-track { display: flex; width: max-content; animation: pef-ticker var(--pef-ticker-duration, 40s) linear infinite; }
        .pef-ticker:hover .pef-ticker-track, .pef-ticker:focus-within .pef-ticker-track { animation-play-state: paused; }
        .pef-ticker-run { display: inline-flex; white-space: nowrap; }
        @keyframes pef-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .pef-ticker-track { animation: none; }
          .pef-ticker-run + .pef-ticker-run { display: none; }
          .pef-ticker-run { white-space: normal; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}

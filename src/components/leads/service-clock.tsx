"use client";

import { useEffect, useState } from "react";
import { Clock, PhoneCall, PhoneOff, UtensilsCrossed } from "lucide-react";
import { callWindow, type CallWindow } from "@/lib/leads/hours";
import { cn } from "@/lib/utils";

// L'horloge du service : dit si c'est l'heure d'appeler un restaurateur — ou pas.
// Règle du kit : jamais pendant le service. Se remet à jour toutes les minutes.
export function ServiceClock() {
  const [w, setW] = useState<CallWindow | null>(null);
  useEffect(() => {
    const tick = () => setW(callWindow(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  if (!w) return null;
  const tone =
    w.state === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : w.state === "service"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-zinc-300 bg-zinc-50 text-zinc-700";
  const Icon = w.state === "ok" ? PhoneCall : w.state === "service" ? UtensilsCrossed : w.state === "weekend" ? Clock : PhoneOff;
  return (
    <div className={cn("flex items-start gap-3 rounded-md border px-3 py-2 text-sm", tone)} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{w.title}</p>
        <p className="text-xs opacity-80">
          {w.detail}
          {w.nextOpen && ` Prochain créneau : ${w.nextOpen}.`}
          {" "}Restauration collective : 9h-11h et 14h-16h.
        </p>
      </div>
    </div>
  );
}

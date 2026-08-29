"use client";

// Écrans d'entraînement du bloc littératie (E1/E2 — non notés).
// E1 : premier geste (filtre illectronisme). E2 : choisir une tuile parmi trois.
// Deux échecs à E2 → passation accompagnée requise : on ne classe JAMAIS quelqu'un
// sur un échec de manipulation de l'interface.

import { useEffect, useRef, useState } from "react";
import { speak } from "./question-card";

export function LiteracyTraining({ onDone, onAbort }) {
  const [step, setStep] = useState(0); // 0 = E1 rond vert, 1 = E2 ballon
  const [fails, setFails] = useState(0);
  const replayRef = useRef(null);

  // Consigne lue à l'arrivée sur chaque écran, re-lue automatiquement après 10 s de silence.
  useEffect(() => {
    const text = step === 0 ? "Bonjour ! Touchez le rond vert." : "Touchez le ballon.";
    const t = setTimeout(() => speak(text), 300);
    replayRef.current = setInterval(() => speak(text), 10_000);
    return () => {
      clearTimeout(t);
      if (replayRef.current) clearInterval(replayRef.current);
    };
  }, [step]);

  function pickE2(emoji) {
    if (emoji === "⚽") {
      speak("Très bien !");
      setTimeout(onDone, 900);
      return;
    }
    if (fails + 1 >= 2) {
      speak("Merci ! Quelqu'un va vous aider pour la suite.");
      setTimeout(onAbort, 1200);
      return;
    }
    setFails((f) => f + 1);
    speak("On recommence. Touchez le ballon.");
  }

  if (step === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <button
          type="button"
          aria-label="Rond vert"
          onClick={() => {
            speak("Très bien !");
            setTimeout(() => setStep(1), 800);
          }}
          className="h-48 w-48 animate-pulse rounded-full bg-green-500 shadow-xl transition-transform active:scale-95"
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="grid w-full max-w-md grid-cols-3 gap-4">
        {["⚽", "🌙", "🍎"].map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => pickE2(emoji)}
            className="flex aspect-square items-center justify-center rounded-2xl border-2 border-gray-200 bg-white text-6xl shadow-sm transition-all hover:border-[#32cf8a] active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </main>
  );
}

"use client";

// Réponse orale au MICRO DU TÉLÉPHONE, avec la reconnaissance vocale du navigateur (Web Speech
// API, fr-FR), comme l'ancien test. La transcription est la réponse, notée par la grille orale
// du module. L'ERP ne reçoit que le texte : aucun enregistrement, aucun fichier audio.
// Repli À L'ÉCRIT tout seul quand le navigateur ne sait pas faire (Firefox, navigateur intégré
// de WhatsApp…), quand le micro est refusé, ou quand la personne préfère écrire.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { arreterLecture } from "@/lib/positionnement/audio";
import { cn } from "@/lib/utils";
import { Bilingue } from "./traduit";

/* Types minimaux de la Web Speech API (absente des types DOM de TypeScript). */
interface ResultatVocal { isFinal: boolean; 0: { transcript: string } }
interface EvenementVocal { resultIndex: number; results: ArrayLike<ResultatVocal> }
interface Reconnaissance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EvenementVocal) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ConstructeurReconnaissance = new () => Reconnaissance;

export function reconnaissanceVocale(): ConstructeurReconnaissance | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstructeurReconnaissance; webkitSpeechRecognition?: ConstructeurReconnaissance };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const rien = () => () => {};
/** Le navigateur sait-il transformer la voix en texte ? null pendant le rendu serveur. */
export function useMicroDisponible(): boolean | null {
  return useSyncExternalStore(rien, () => reconnaissanceVocale() !== null, () => null);
}

const champClass =
  "block w-full rounded-2xl border-2 border-zinc-200 bg-white px-4 py-3 text-lg leading-relaxed text-zinc-950 outline-none transition-colors focus:border-[#00504E] focus:ring-4 focus:ring-[#32CF8A]/30";

export function MicroVocal({
  dureeMax,
  langue,
  valeur,
  onChange,
  onEcrit,
}: {
  /** Durée maximale de parole (secondes), donnée par l'item. */
  dureeMax: number;
  langue: string;
  valeur: string;
  onChange: (texte: string) => void;
  /** Passage à l'écrit (micro impossible ou refusé, ou choix de la personne). */
  onEcrit: () => void;
}) {
  const [ecoute, setEcoute] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [alerte, setAlerte] = useState<"microRien" | null>(null);
  const reco = useRef<Reconnaissance | null>(null);
  const minuteur = useRef<number | null>(null);
  const entendu = useRef(false);

  const couperMinuteur = () => {
    if (minuteur.current) window.clearInterval(minuteur.current);
    minuteur.current = null;
  };

  useEffect(() => () => {
    couperMinuteur();
    reco.current?.abort();
    reco.current = null;
  }, []);

  function arreter() {
    couperMinuteur();
    reco.current?.stop();
  }

  function demarrer() {
    const SR = reconnaissanceVocale();
    if (!SR) { onEcrit(); return; }
    arreterLecture(); // la consigne lue à voix haute ne doit pas être transcrite
    setAlerte(null);
    entendu.current = false;
    let r: Reconnaissance;
    try {
      r = new SR();
    } catch {
      onEcrit();
      return;
    }
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    let final = "";
    r.onresult = (e) => {
      let provisoire = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += `${t} `;
        else provisoire += t;
      }
      const texte = `${final}${provisoire}`.replace(/\s+/g, " ").trim();
      if (texte) entendu.current = true;
      onChange(texte);
    };
    r.onerror = (e) => {
      couperMinuteur();
      setEcoute(false);
      reco.current = null;
      if (e.error === "no-speech" || e.error === "aborted") { setAlerte("microRien"); return; }
      // not-allowed, service-not-allowed, audio-capture, network… : on passe à l'écrit.
      onEcrit();
    };
    r.onend = () => {
      couperMinuteur();
      setEcoute(false);
      reco.current = null;
      if (!entendu.current) setAlerte((a) => a ?? "microRien");
    };
    try {
      r.start();
    } catch {
      onEcrit();
      return;
    }
    reco.current = r;
    onChange("");
    setEcoute(true);
    setSecondes(0);
    minuteur.current = window.setInterval(() => {
      setSecondes((s) => {
        if (s + 1 >= dureeMax) arreter();
        return s + 1;
      });
    }, 1000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#00504E]/10">
        {ecoute ? (
          <>
            <p className="flex items-center gap-2 text-lg font-semibold text-[#00504E]" aria-live="polite">
              <span aria-hidden className="h-3 w-3 rounded-full bg-red-500 motion-safe:animate-pulse" />
              <Bilingue cle="microEcoute" langue={langue} />
            </p>
            <button
              type="button"
              onClick={arreter}
              className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-red-700 px-6 text-xl font-semibold text-white"
            >
              <Square className="h-6 w-6 shrink-0 fill-current" aria-hidden />
              <Bilingue cle="microArreter" langue={langue} className="items-center" />
              <span className="text-base font-normal opacity-90">({Math.max(0, dureeMax - secondes)} s)</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={demarrer}
            data-testid="bouton-micro"
            className={cn(
              "inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-[#00504E] px-6 text-xl font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,80,78,0.8)] active:scale-[0.99]",
              valeur ? "min-h-16" : "min-h-24",
            )}
          >
            <Mic className={valeur ? "h-7 w-7 shrink-0" : "h-10 w-10 shrink-0"} aria-hidden />
            <Bilingue cle={valeur ? "microEncore" : "microParler"} langue={langue} className="items-center" />
          </button>
        )}
        <p className="text-sm text-zinc-500">{dureeMax} secondes au plus.</p>
      </div>
      {alerte && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-base text-amber-950 ring-1 ring-amber-200">
          <Bilingue cle={alerte} langue={langue} />
        </p>
      )}
      {valeur && !ecoute && (
        <label className="block space-y-1">
          <span className="text-base font-medium text-zinc-700"><Bilingue cle="microTexte" langue={langue} /></span>
          <textarea rows={4} value={valeur} onChange={(e) => onChange(e.target.value)} className={champClass} />
        </label>
      )}
      {!ecoute && (
        <button type="button" onClick={onEcrit} className="inline-flex items-start gap-2 text-base font-medium text-[#00504E]">
          <span aria-hidden>✍️</span>
          <Bilingue cle="microEcrire" langue={langue} className="underline underline-offset-4" />
        </button>
      )}
    </div>
  );
}

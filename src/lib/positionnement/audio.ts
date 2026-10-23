// Lecture des consignes du test de positionnement (repris de ToFrance) : audio pré-enregistré
// (public/audio/tts/<empreinte>.mp3, voix fr-FR-DeniseNeural), synthèse du navigateur en repli.
// Un seul élément <audio>, débloqué par le premier geste (iPhone). NAVIGATEUR UNIQUEMENT.
import { AUDIOS_DISPONIBLES, DOSSIER_AUDIOS, ttsClean, ttsHash } from "./client";

/** Lecture en cours : `fin` à la fin normale, `interrompu` si une autre lecture ou un arrêt la coupe. */
interface Lecture { id: number; fin?: () => void; interrompu?: () => void }

let lecteur: HTMLAudioElement | null = null;
let courante: Lecture | null = null;
let prochainId = 1;
/** Délai au-delà duquel une synthèse qui n'a pas démarré est considérée bloquée (iPhone sans geste). */
const DELAI_DEMARRAGE_SYNTHESE = 2000;

function terminer(id: number) {
  if (!courante || courante.id !== id) return;
  const c = courante;
  courante = null;
  c.fin?.();
}

function obtenirLecteur(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof window.Audio === "undefined") return null;
  if (!lecteur) {
    lecteur = new window.Audio();
    lecteur.addEventListener("ended", () => { if (courante) terminer(courante.id); });
  }
  return lecteur;
}

function synthese(texte: string, id: number): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    terminer(id); // rien à lire : on enchaîne quand même
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let demarre = false;
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = "fr-FR";
    u.rate = 0.85;
    const voix = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
    if (voix) u.voice = voix;
    u.onstart = () => { demarre = true; resolve(true); };
    u.onend = () => { resolve(true); terminer(id); };
    u.onerror = () => {
      resolve(demarre);
      if (courante?.id === id) { const c = courante; courante = null; c.interrompu?.(); }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    window.setTimeout(() => {
      if (demarre || courante?.id !== id) return;
      // Jamais démarrée (lecture automatique bloquée) : on abandonne sans appeler `fin`.
      courante = null;
      window.speechSynthesis.cancel();
      resolve(false);
    }, DELAI_DEMARRAGE_SYNTHESE);
  });
}

export function arreterLecture() {
  const a = lecteur;
  if (a && !a.paused) a.pause();
  const c = courante;
  courante = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  c?.interrompu?.();
}

/**
 * Lit un texte en français. `fin` est appelé à la fin normale de la lecture, `interrompu` si elle
 * est coupée (autre lecture, arrêt). La promesse dit si la lecture a vraiment démarré (false si
 * le navigateur l'a bloquée, par ex. lecture automatique sur iPhone sans geste).
 */
export function lire(texteBrut: string, fin?: () => void, interrompu?: () => void): Promise<boolean> {
  const texte = ttsClean(texteBrut ?? "");
  if (!texte) { fin?.(); return Promise.resolve(false); }
  arreterLecture();
  const id = prochainId++;
  courante = { id, fin, interrompu };
  const a = obtenirLecteur();
  const h = ttsHash(texte);
  if (a && AUDIOS_DISPONIBLES.has(h)) {
    a.src = `${DOSSIER_AUDIOS}/${h}.mp3`;
    let p: Promise<void> | undefined;
    try { p = a.play(); } catch { p = Promise.reject(new Error("lecture impossible")); }
    return Promise.resolve(p).then(
      () => true,
      () => (courante?.id === id ? synthese(texte, id) : false),
    );
  }
  return synthese(texte, id);
}

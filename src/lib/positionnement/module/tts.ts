// Consignes audio : chaque texte parlé a un fichier « <empreinte>.mp3 » (public/audio/positionnement/).
// L'empreinte (djb2, hexadécimal) est celle de l'outil d'origine : les audios déjà générés restent valides.

export function ttsHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Retire ce qui ne se vocalise pas (emoji, drapeaux, sélecteurs) : « 🇫🇷 Oui » se lit « Oui ». */
export function ttsClean(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}|\u{20E3}|[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Niveaux où la consigne est lue automatiquement (public qui ne lit pas forcément). */
export const NIVEAUX_LECTURE_AUTO = ["Pré-alpha", "Alpha", "A1.1", "A1", "A2"];

/** Phrases de l'interface vocalisées (entraînement du bloc littératie). */
export const PHRASES_INTERFACE = [
  "Bonjour !",
  "Bonjour ! Touchez le rond vert.",
  "Touchez le ballon.",
  "Très bien !",
  "On recommence. Touchez le ballon.",
  "Merci ! Quelqu'un va vous aider pour la suite.",
];

interface ItemParle {
  question?: string;
  audioText?: string;
  options?: string[];
  type?: string;
  level?: string;
  competence?: string;
  noAudio?: boolean;
}

/**
 * Options lues à voix haute ? Jamais pour la compréhension écrite (ce serait donner la réponse) ;
 * oui pour la littératie (sauf noAudio) et pour l'oral et la langue aux bas niveaux.
 */
export function optionsLues(q: ItemParle): boolean {
  if (q.noAudio) return false;
  if (q.type === "big_choice") return true;
  if (q.competence === "CE" || q.competence === "PE") return false;
  return NIVEAUX_LECTURE_AUTO.includes(q.level ?? "") && ["listen_choose", "fill_in_blank", "complete_dialogue"].includes(q.type ?? "");
}

/** Tous les textes à synthétiser pour une banque (consignes, audios, options lues). */
export function textesParles(items: ItemParle[]): string[] {
  const brut = new Set<string>(PHRASES_INTERFACE);
  for (const q of items) {
    if (q.question) brut.add(q.question);
    if (q.audioText) brut.add(q.audioText);
    if (optionsLues(q)) for (const o of q.options ?? []) brut.add(o);
  }
  return [...new Set([...brut].map(ttsClean).filter(Boolean))].sort();
}

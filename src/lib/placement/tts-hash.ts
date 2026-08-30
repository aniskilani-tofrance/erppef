// Hash djb2 (hex) partagé entre le générateur d'audios (scripts/generate-tts.mts)
// et le lecteur (question-card) : le nom de fichier d'un audio est le hash de son texte.
export function ttsHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Retire tout ce qui ne doit pas être VOCALISÉ : emoji/pictogrammes (y compris
// drapeaux, sélecteurs de variante, ZWJ). « 🇫🇷 Oui » se lit « Oui », jamais
// « drapeau France Oui ». Un texte purement emoji devient vide (rien à dire).
export function ttsClean(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

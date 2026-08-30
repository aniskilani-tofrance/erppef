// Hash djb2 (hex) partagé entre le générateur d'audios (scripts/generate-tts.mts)
// et le lecteur (question-card) : le nom de fichier d'un audio est le hash de son texte.
export function ttsHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

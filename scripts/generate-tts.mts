// Collecte tous les textes parlés du test de positionnement et écrit :
// - src/lib/placement/tts-manifest.json  (hash → vrai)
// - <scratch>/tts-texts.json             (hash → texte, pour le générateur Python edge-tts)
// Usage : npx tsx scripts/generate-tts.mts
import { writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { questions } from "../src/lib/placement/questions";
import { literacyQuestions } from "../src/lib/placement/literacy-questions";
import { ttsHash, ttsClean } from "../src/lib/placement/tts-hash";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LOW_LEVELS = ["Pré-alpha", "Alpha", "A1.1", "A1", "A2"];
const OPTION_AUDIO_TYPES = ["listen_choose", "scenario_tree", "safety_instruction", "fill_in_blank", "complete_dialogue"];
const UI_PHRASES = [
  "Bonjour !",
  "Bonjour ! Touchez le rond vert.",
  "Touchez le ballon.",
  "Très bien !",
  "On recommence. Touchez le ballon.",
  "Merci ! Quelqu'un va vous aider pour la suite.",
];

const raw = new Set<string>(UI_PHRASES);
for (const q of [...literacyQuestions, ...questions] as any[]) {
  if (q.question) raw.add(q.question);
  if (q.audioText) raw.add(q.audioText);
  const optionAudio =
    (LOW_LEVELS.includes(q.level) && !q.noAudio && OPTION_AUDIO_TYPES.includes(q.type)) ||
    (q.type === "big_choice" && !q.noAudio);
  if (optionAudio) for (const o of q.options ?? []) raw.add(o);
}
const texts = new Set<string>([...raw].map(ttsClean).filter(Boolean));

const map: Record<string, string> = {};
for (const t of texts) map[ttsHash(t)] = t;

writeFileSync("src/lib/placement/tts-manifest.json", JSON.stringify(Object.keys(map).sort(), null, 0));
writeFileSync(process.env.TTS_OUT ?? "/tmp/tts-texts.json", JSON.stringify(map, null, 1));
console.log(`${texts.size} textes collectés`);

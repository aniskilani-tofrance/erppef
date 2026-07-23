// Génère les messages audio de bienvenue via ElevenLabs (une seule fois : les MP3
// sont ensuite servis en statique, zéro coût / latence à la connexion).
// Usage : ELEVENLABS_API_KEY=sk_... node scripts/generate-greetings.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY manquante");
  process.exit(1);
}

// Voix française chaleureuse (multilingue v2). Sarah = voix féminine posée ;
// remplacer par un autre voice_id ElevenLabs si souhaité.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";

const GREETINGS = [
  { file: "greeting-1.mp3", text: "Bonjour, et bienvenue sur votre espace ParlerEmploi Formation. Très bonne journée !" },
  { file: "greeting-2.mp3", text: "Bonjour ! Ravie de vous revoir. Excellente journée avec vos apprenants !" },
  { file: "greeting-3.mp3", text: "Bonjour et bienvenue ! Que cette journée de formation soit belle et productive." },
  { file: "greeting-4.mp3", text: "Bonjour ! Toute l'équipe vous souhaite une très bonne journée." },
];

mkdirSync("public/audio", { recursive: true });

for (const g of GREETINGS) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: g.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35 },
    }),
  });
  if (!res.ok) {
    console.error(`${g.file}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  writeFileSync(`public/audio/${g.file}`, Buffer.from(await res.arrayBuffer()));
  console.log(`OK ${g.file} (${g.text.slice(0, 40)}…)`);
}
console.log("Terminé : public/audio/");

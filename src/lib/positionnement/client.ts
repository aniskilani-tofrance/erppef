// Test de positionnement côté NAVIGATEUR : uniquement le point d'entrée « client » du module
// partagé (types, consignes traduites, audio, libellés) — aucune bonne réponse. Les questions
// arrivent du serveur, déjà épurées (items-publics.ts).
export * from "./module/client.ts";
import manifeste from "./audios.json";

/** Empreintes des audios disponibles (voix fr-FR-DeniseNeural), rangés dans public/audio/tts/. */
export const AUDIOS_DISPONIBLES = new Set<string>(manifeste as string[]);
/** Même dossier que l'ancien test : les 125 audios communs sont identiques, les autres ajoutés. */
export const DOSSIER_AUDIOS = "/audio/tts";

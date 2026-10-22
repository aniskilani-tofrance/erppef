// Point d'entrée NAVIGATEUR : uniquement ce qui ne révèle aucune bonne réponse
// (types, consignes traduites, audio, descripteurs, libellés). Vérifié par un test.

export * from "./types.ts";
export * from "./consignes.ts";
export * from "./tts.ts";
export * from "./descripteurs.ts";
export { LIBELLES_PROFIL, MENTION, libelleNiveau } from "./libelles.ts";
export * from "./prenom.ts";

// Module « test de positionnement » — point d'entrée SERVEUR (contient les bonnes réponses).
// Le navigateur importe client.ts, jamais ce fichier.
//
// Module autonome, partageable avec l'ERP (aucune dépendance : ni React, ni Next.js, ni Deno, ni
// Supabase ; l'IA est injectée). Partage : copie synchronisée avec contrôle d'empreinte
// (empreinte.json, scripts/positionnement-empreinte.mjs) — voir decisions/2026-10-15-test-positionnement.md.

export * from "./types.ts";
export * from "./banque.ts";
export * from "./correction.ts";
export * from "./grille.ts";
export * from "./parcours.ts";
export * from "./profil.ts";
export * from "./descripteurs.ts";
export * from "./recommandations.ts";
export * from "./faits.ts";
export * from "./publics.ts";
export * from "./consignes.ts";
export * from "./tts.ts";
export * from "./moteur.ts";
export * from "./prenom.ts";

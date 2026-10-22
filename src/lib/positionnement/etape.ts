// Ce que le navigateur reçoit du serveur pendant le test (types seulement, sans bonne réponse).
import type { Item } from "./module/client.ts";

export type EtapeTest =
  | {
      statut: "en_cours";
      prenom: string;
      /** Items à présenter maintenant, sans bonne réponse. Vide = à terminer. */
      items: Item[];
      bloc: string;
      /** 0 à 100, estimation (le parcours s'adapte). */
      progression: number;
      /** Au moins une réponse rangée : on reprend, sans refaire l'entraînement. */
      commence: boolean;
    }
  | { statut: "fait"; prenom: string };

export type ResultatTest = { ok: true; etape: EtapeTest } | { ok: false; error: string };

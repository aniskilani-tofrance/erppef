"use client";

import { useEffect } from "react";
import { postToHost } from "@/lib/inscription/embed";

// Mode intégré (/inscription?embed=1) : envoie la hauteur du formulaire à la page qui
// l'accueille à chaque changement (écran suivant, message d'erreur, créneaux…). On mesure
// le cadre du formulaire et non la page : <body> fait au moins la hauteur de l'iframe, il
// ne rapetisserait jamais. Chaque cadre (formulaire, écran de fin) monte son propre pont.
export function EmbedBridge() {
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>("[data-pef-inscription]");
    if (!frame) return;
    let last = 0;
    const send = () => {
      const height = Math.ceil(frame.getBoundingClientRect().height);
      if (!height || height === last) return;
      last = height;
      postToHost({ type: "pef-inscription:height", height });
    };
    // Pas d'envoi immédiat : à l'hydratation, le formulaire montre encore tous ses écrans
    // (rendu sans JavaScript) et la page parente sauterait. Le ResizeObserver donne la
    // première mesure juste après, une fois l'écran d'accueil seul affiché.
    const observer = new ResizeObserver(send);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  return null;
}

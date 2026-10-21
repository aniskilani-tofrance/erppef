// Formulaire d'inscription rapide intégré dans une autre page (site parleremploiformation.pro,
// géré avec Lovable) : /inscription?embed=1 dans une <iframe>. Le formulaire envoie à la page
// qui l'accueille sa hauteur (pour qu'elle ajuste l'iframe, sans double barre de défilement)
// et les étapes franchies (pour remonter en haut du formulaire). Aucune donnée personnelle
// dans ces messages : seulement un type et une hauteur.

/** Sites autorisés à afficher /inscription dans une iframe (en-tête CSP frame-ancestors). */
export const SIGNUP_FRAME_ANCESTORS = [
  "'self'",
  "https://parleremploiformation.pro",
  "https://*.parleremploiformation.pro",
  // Lovable : site publié (*.lovable.app), aperçu (*.lovableproject.com) et éditeur
  // (lovable.dev), car frame-ancestors vérifie toute la chaîne de pages parentes.
  "https://*.lovable.app",
  "https://*.lovableproject.com",
  "https://lovable.dev",
  "https://*.lovable.dev",
] as const;

export const SIGNUP_FRAME_CSP = `frame-ancestors ${SIGNUP_FRAME_ANCESTORS.join(" ")}`;

export type SignupEmbedEvent =
  | { type: "pef-inscription:height"; height: number }
  | { type: "pef-inscription:step" }
  | { type: "pef-inscription:done" }
  | { type: "pef-inscription:booked" };

/** ?embed=1 (ou true / oui) → mode intégré. */
export function isEmbedParam(raw: string | null | undefined): boolean {
  return ["1", "true", "oui"].includes((raw ?? "").trim().toLowerCase());
}

/** Prévient la page qui accueille l'iframe ; sans effet hors iframe. */
export function postToHost(event: SignupEmbedEvent): void {
  if (typeof window === "undefined" || window.parent === window) return;
  try {
    // « * » : le message ne contient ni nom ni numéro, la page parente peut changer de domaine
    // (aperçu Lovable, site publié) ; c'est elle qui vérifie l'origine du formulaire.
    window.parent.postMessage(event, "*");
  } catch {
    // Navigateur qui refuse : l'iframe garde sa hauteur de départ.
  }
}

/** Code à coller dans le site : iframe + script qui ajuste la hauteur et remonte en haut. */
export function siteEmbedSnippet(origin: string, src = "Site internet"): string {
  const base = origin.replace(/\/+$/, "");
  const url = `${base}/inscription?embed=1&src=${encodeURIComponent(src)}`;
  return [
    `<iframe id="pef-inscription" src="${url}" title="Inscription aux cours de français" loading="lazy"`,
    `  style="width:100%;height:720px;border:0;display:block"></iframe>`,
    `<script>`,
    `  window.addEventListener("message", function (e) {`,
    `    if (e.origin !== "${base}" || !e.data || typeof e.data.type !== "string") return;`,
    `    var f = document.getElementById("pef-inscription");`,
    `    if (!f) return;`,
    `    if (e.data.type === "pef-inscription:height") f.style.height = e.data.height + "px";`,
    // Écran suivant : on ne remonte que si le haut du formulaire est sorti de l'écran.
    `    if (e.data.type === "pef-inscription:step" && f.getBoundingClientRect().top < 0) f.scrollIntoView({ behavior: "smooth", block: "start" });`,
    `  });`,
    `</script>`,
  ].join("\n");
}

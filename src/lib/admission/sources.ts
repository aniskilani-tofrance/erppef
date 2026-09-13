import { CONTACT_SOURCES } from "@/lib/referentiels";

// Provenance d'un apprenant (« Nous a contactés par ») : une couleur fixe par canal, la
// même partout (pastille dans les listes, légende de la carte « D'où viennent les demandes »,
// filtre). Les teintes sont choisies éloignées les unes des autres ; le libellé reste toujours
// disponible au survol pour ne jamais reposer sur la couleur seule.

export type ContactSourceCode = (typeof CONTACT_SOURCES)[number]["code"];

export const NC_SOURCE = "nc" as const;

const COLORS: Record<ContactSourceCode, string> = {
  bouche_a_oreille: "#f97316", // orange
  passage_accueil: "#84cc16", // lime
  telephone: "#0284c7", // bleu ciel
  whatsapp: "#16a34a", // vert WhatsApp
  email: "#6366f1", // indigo
  site_web: "#9333ea", // violet
  reseaux_sociaux: "#ec4899", // rose
  france_travail: "#1e3a8a", // bleu marine
  partenaire: "#0d9488", // sarcelle
  affiche_flyer: "#ef4444", // rouge
  autre: "#78716c", // pierre
};

export const NC_COLOR = "#d4d4d8"; // non renseigné : pastille creuse gris clair

export type SourceStyle = { code: string; label: string; color: string; hollow: boolean };

/** Style d'affichage d'un canal (code inconnu ou vide = « Non renseigné », pastille creuse). */
export function sourceStyle(code: string | null | undefined): SourceStyle {
  const found = CONTACT_SOURCES.find((s) => s.code === code);
  if (!found) return { code: NC_SOURCE, label: "Non renseigné", color: NC_COLOR, hollow: true };
  return { code: found.code, label: found.label, color: COLORS[found.code], hollow: false };
}

/** Texte d'infobulle : « Nous a contactés par : France Travail — conseiller de Saint-Denis ». */
export function sourceTitle(code: string | null | undefined, detail?: string | null): string {
  const { label } = sourceStyle(code);
  const extra = detail?.trim();
  return `Nous a contactés par : ${label}${extra ? ` — ${extra}` : ""}`;
}

/** Tous les canaux avec leur couleur, puis « Non renseigné » (ordre du référentiel). */
export function allSourceStyles(): SourceStyle[] {
  return [...CONTACT_SOURCES.map((s) => sourceStyle(s.code)), sourceStyle(null)];
}

// RÉFÉRENTIEL UNIQUE des listes de valeurs apprenant.
// Tout en découle : formulaires de l'ERP, interprétation des imports (Excel/Drive),
// et GÉNÉRATION du modèle Excel (npm run modele) — les menus déroulants du fichier
// et ceux de l'application ne peuvent pas diverger.

export const LEVELS = [
  "Pré-alpha",
  "Alpha",
  "Alpha avancé",
  "Post-alpha (A1.1 en cours)",
  "A1.1",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

export const GENDERS = [
  { code: "femme", label: "Femme", aliases: ["f"] },
  { code: "homme", label: "Homme", aliases: ["h", "m"] },
  { code: "autre", label: "Autre", aliases: [] },
] as const;

export const ACTIVITIES = [
  { code: "demandeur_emploi", label: "Demandeur d'emploi", aliases: ["de", "demandeur emploi"] },
  { code: "rsa", label: "RSA", aliases: ["bénéficiaire du rsa"] },
  { code: "salarie", label: "Salarié", aliases: ["salarie"] },
  { code: "scolaire_etudiant", label: "Scolaire / étudiant", aliases: ["scolaire", "étudiant", "etudiant"] },
  { code: "inactif_autre", label: "Inactif / autre", aliases: ["inactif", "autre"] },
] as const;

export const EDUCATION = [
  { code: "non_scolarise", label: "Jamais scolarisé", aliases: ["jamais scolarise", "non scolarisé", "non scolarise"] },
  { code: "primaire", label: "Primaire", aliases: [] },
  { code: "secondaire", label: "Secondaire", aliases: ["collège", "college", "lycée", "lycee"] },
  { code: "superieur", label: "Supérieur", aliases: ["superieur"] },
] as const;

// Découpage Ville de Saint-Ouen (bilans territorialisés du financeur municipal)
export const DISTRICTS = [
  "Centre-Ville-Cordon",
  "Les Docks",
  "Vieux-Saint-Ouen",
  "Debain-Michelet-Bauer",
  "Garibaldi - Les Puces",
  "Arago-Pasteur-Zola-Hugo",
] as const;

export const PRESCRIBERS = [
  "France Travail",
  "Mission locale",
  "CCAS",
  "Spontané",
  "Association partenaire",
  "Autre",
] as const;

// Table de correspondance texte → code, tolérante (labels, codes, alias, casse, accents)
export function buildLookup(
  entries: readonly { code: string; label: string; aliases: readonly string[] }[],
): (raw: string) => string | null {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(norm(e.code), e.code);
    map.set(norm(e.label), e.code);
    for (const a of e.aliases) map.set(norm(a), e.code);
  }
  return (raw: string) => map.get(norm(raw)) ?? null;
}

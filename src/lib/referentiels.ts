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

// Types de contrat formateur (le type « prestataire » = sous-traitance, Qualiopi ind. 27)
export const CONTRACT_LABELS: Record<string, string> = {
  salarie: "Salarié",
  vacataire: "Vacataire",
  prestataire: "Prestataire",
};

// Objectifs d'entrée (analyse du besoin, Qualiopi ind. 4)
export const GOALS = [
  { code: "acces_emploi", label: "Accès à l'emploi", aliases: ["emploi", "trouver un emploi"] },
  { code: "formation_qualifiante", label: "Poursuite vers une formation", aliases: ["formation", "formation qualifiante"] },
  { code: "autonomie", label: "Autonomie de la vie quotidienne", aliases: ["autonomie quotidienne", "vie quotidienne"] },
  { code: "naturalisation", label: "Naturalisation / titre de séjour", aliases: ["naturalisation", "titre de séjour", "titre de sejour"] },
  // NB : pas de virgule dans les labels — les menus déroulants Excel (listes inline) se séparent dessus
  { code: "examen_certification", label: "Préparer un examen (DELF / DCL…)", aliases: ["examen", "certification", "delf", "dcl"] },
  { code: "autre", label: "Autre projet", aliases: ["autre"] },
] as const;

// Canal par lequel la personne NOUS a contactés (≠ prescripteur = qui l'oriente).
// Sert à savoir d'où viennent les demandes (page Admission, bilans financeurs).
// NB : pas de virgule dans les labels (menus Excel inline).
export const CONTACT_SOURCES = [
  { code: "bouche_a_oreille", label: "Bouche-à-oreille", aliases: ["bouche a oreille", "bouche à oreille", "connaissance", "ami", "famille", "ancien apprenant"] },
  { code: "passage_accueil", label: "Passage à l'accueil", aliases: ["accueil", "sur place", "passage", "venu sur place"] },
  { code: "telephone", label: "Appel téléphonique", aliases: ["téléphone", "telephone", "appel", "tel"] },
  { code: "whatsapp", label: "WhatsApp", aliases: ["wa", "message whatsapp"] },
  { code: "email", label: "Email", aliases: ["mail", "courriel", "e-mail"] },
  { code: "site_web", label: "Site internet", aliases: ["site", "internet", "web", "formulaire", "formulaire du site"] },
  { code: "reseaux_sociaux", label: "Réseaux sociaux", aliases: ["facebook", "instagram", "tiktok", "linkedin", "réseaux", "reseaux"] },
  { code: "france_travail", label: "France Travail", aliases: ["pôle emploi", "pole emploi", "ft", "conseiller france travail"] },
  { code: "partenaire", label: "Orienté par un partenaire", aliases: ["partenaire", "association", "mairie", "ccas", "mission locale", "cip", "assistante sociale"] },
  { code: "affiche_flyer", label: "Affiche / flyer", aliases: ["affiche", "flyer", "tract", "prospectus"] },
  { code: "autre", label: "Autre canal", aliases: ["autre"] },
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

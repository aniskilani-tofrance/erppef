// Module « Financements » (lot 1) : valeurs fermées et libellés en français.
// Les codes sont ceux des contraintes check de la migration 0049.

export const FAMILIES = ["aap", "appel_offres", "mecenat"] as const;
export type Family = (typeof FAMILIES)[number];
export const FAMILY_LABELS: Record<Family, string> = {
  aap: "Appel à projets",
  appel_offres: "Appel d'offres",
  mecenat: "Mécénat",
};

export const WATCH_STATUSES = ["nouveau", "a_surveiller", "a_evaluer", "retenu", "ecarte"] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];
export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  nouveau: "Nouveau",
  a_surveiller: "À surveiller",
  a_evaluer: "À évaluer",
  retenu: "Retenu",
  ecarte: "Écarté",
};
export const WATCH_STATUS_CLASSES: Record<WatchStatus, string> = {
  nouveau: "border-sky-300 bg-sky-50 text-sky-800",
  a_surveiller: "border-slate-300 bg-slate-50 text-slate-700",
  a_evaluer: "border-amber-300 bg-amber-50 text-amber-800",
  retenu: "border-emerald-300 bg-emerald-50 text-emerald-800",
  ecarte: "border-zinc-300 bg-zinc-100 text-zinc-500",
};

export const STAGES = ["on_y_va", "en_redaction", "depose", "accorde", "refuse", "bilan_rendu", "abandonne"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  on_y_va: "On y va",
  en_redaction: "En rédaction",
  depose: "Déposé",
  accorde: "Accordé",
  refuse: "Refusé",
  bilan_rendu: "Bilan rendu",
  abandonne: "Abandonné",
};
export const STAGE_CLASSES: Record<Stage, string> = {
  on_y_va: "border-sky-300 bg-sky-50 text-sky-800",
  en_redaction: "border-amber-300 bg-amber-50 text-amber-800",
  depose: "border-violet-300 bg-violet-50 text-violet-800",
  accorde: "border-emerald-300 bg-emerald-50 text-emerald-800",
  refuse: "border-red-300 bg-red-50 text-red-700",
  bilan_rendu: "border-teal-300 bg-teal-50 text-teal-800",
  abandonne: "border-zinc-300 bg-zinc-100 text-zinc-500",
};

export const PORTALS = ["dauphin", "compte_asso", "sub_cd93", "mesdemarches_idf", "e_synergie", "plateforme_fondation", "courriel", "autre"] as const;
export type Portal = (typeof PORTALS)[number];
export const PORTAL_LABELS: Record<Portal, string> = {
  dauphin: "Dauphin (politique de la ville)",
  compte_asso: "Le Compte Asso",
  sub_cd93: "Subventions du Département 93",
  mesdemarches_idf: "Mes démarches (Région IDF)",
  e_synergie: "e-Synergie (FSE+)",
  plateforme_fondation: "Plateforme de la fondation",
  courriel: "Courriel",
  autre: "Autre",
};

export const FUNDER_KINDS = ["etat", "region", "departement", "commune", "intercommunalite", "europe", "fondation", "entreprise", "autre"] as const;
export type FunderKind = (typeof FUNDER_KINDS)[number];
export const FUNDER_KIND_LABELS: Record<FunderKind, string> = {
  etat: "État",
  region: "Région",
  departement: "Département",
  commune: "Commune",
  intercommunalite: "Intercommunalité",
  europe: "Europe",
  fondation: "Fondation",
  entreprise: "Entreprise",
  autre: "Autre",
};

export const DEADLINE_KINDS = ["depot", "compte_rendu", "versement", "rendez_vous", "piece", "autre"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  depot: "Dépôt",
  compte_rendu: "Compte rendu / bilan",
  versement: "Versement",
  rendez_vous: "Rendez-vous",
  piece: "Pièce à fournir",
  autre: "Autre",
};
// Couleur par type d'échéance (calendrier) : pastille + fond léger.
export const DEADLINE_KIND_CLASSES: Record<DeadlineKind, { dot: string; chip: string }> = {
  depot: { dot: "bg-violet-500", chip: "border-violet-300 bg-violet-50 text-violet-800" },
  compte_rendu: { dot: "bg-teal-500", chip: "border-teal-300 bg-teal-50 text-teal-800" },
  versement: { dot: "bg-emerald-500", chip: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  rendez_vous: { dot: "bg-sky-500", chip: "border-sky-300 bg-sky-50 text-sky-800" },
  piece: { dot: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-800" },
  autre: { dot: "bg-slate-400", chip: "border-slate-300 bg-slate-50 text-slate-700" },
};

export const DEFAULT_REMINDER_DAYS = [30, 15, 3] as const;

// Rôles qui voient le module (lot 1) : la coordination et l'administration seulement.
export const FINANCEMENTS_ROLES = ["admin", "coordinator"] as const;

export const BASE_URL = "https://pef-erp.vercel.app";

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

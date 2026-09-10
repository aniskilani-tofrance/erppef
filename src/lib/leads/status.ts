// Pipeline des leads restaurateurs : du formulaire à la convention POEI.
// Les statuts sont ordonnés ; « gagné », « perdu » et « hors cible » sont des sorties.
// Le vocabulaire est celui du kit Shahzad v3 (Drive « Kit Shahzad — Leads POEI »).

export const LEAD_STATUSES = [
  { code: "nouveau", label: "Nouveau", rank: 0, hint: "Jamais contacté — à rappeler sous 24 h", final: false },
  { code: "a_rappeler", label: "À rappeler", rank: 1, hint: "Créneau convenu ou relance en cours", final: false },
  { code: "contacte", label: "Contacté", rank: 2, hint: "Échange engagé, besoin pas encore qualifié", final: false },
  { code: "qualifie", label: "Qualifié", rank: 3, hint: "Besoin, contrat et décideur connus", final: false },
  { code: "rdv_pris", label: "RDV pris", rank: 4, hint: "Rendez-vous posé avec la direction", final: false },
  { code: "rdv_tenu", label: "RDV tenu", rank: 5, hint: "Le rendez-vous a eu lieu", final: false },
  { code: "proposition", label: "Proposition envoyée", rank: 6, hint: "Devis ou convention en cours", final: false },
  { code: "gagne", label: "Gagné", rank: 7, hint: "Convention signée", final: true },
  { code: "perdu", label: "Perdu", rank: 8, hint: "Sans suite — raison notée", final: true },
  { code: "hors_cible", label: "Hors cible", rank: 9, hint: "Pas un employeur, pas de besoin, hors zone", final: true },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["code"];
export const LEAD_STATUS_CODES = LEAD_STATUSES.map((s) => s.code) as [LeadStatus, ...LeadStatus[]];

export function leadStatusLabel(code: string | null | undefined): string {
  return LEAD_STATUSES.find((s) => s.code === code)?.label ?? "Nouveau";
}

export function isFinalStatus(code: string | null | undefined): boolean {
  return LEAD_STATUSES.find((s) => s.code === code)?.final ?? false;
}

// Badge du statut : lisible d'un coup d'œil dans la liste (variant outline + couleur).
export function leadStatusBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "a_rappeler":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "contacte":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "qualifie":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "rdv_pris":
      return "border-teal-300 bg-teal-50 text-teal-800";
    case "rdv_tenu":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "proposition":
      return "border-indigo-300 bg-indigo-50 text-indigo-800";
    case "gagne":
      return "border-emerald-400 bg-emerald-100 text-emerald-900";
    case "perdu":
      return "border-zinc-300 bg-zinc-100 text-zinc-600";
    case "hors_cible":
      return "border-zinc-300 bg-zinc-50 text-zinc-500";
    default:
      return "border-red-300 bg-red-50 text-red-700"; // nouveau : rouge = urgent, à rappeler
  }
}

export const LEAD_SCORES = [
  { code: "chaud", label: "Chaud", hint: "Poste ferme, échéance < 3 mois, contrat éligible, décideur au téléphone" },
  { code: "tiede", label: "Tiède", hint: "Besoin réel mais échéance floue, contrat à vérifier ou décideur à joindre" },
  { code: "froid", label: "Froid", hint: "Curiosité, extras seulement, pas de poste identifié" },
] as const;
export type LeadScore = (typeof LEAD_SCORES)[number]["code"];
export const LEAD_SCORE_CODES = LEAD_SCORES.map((s) => s.code) as [LeadScore, ...LeadScore[]];

export function scoreBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "chaud":
      return "border-red-300 bg-red-50 text-red-700";
    case "tiede":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "froid":
      return "border-sky-300 bg-sky-50 text-sky-800";
    default:
      return "border-zinc-300 bg-zinc-50 text-zinc-500";
  }
}

export const LEAD_SEGMENTS = [
  { code: "rapide_franchise", label: "Rapide / franchise", hint: "McDonald's, KFC, Burger King, O'Tacos, kebabs, pizzerias indépendantes" },
  { code: "traditionnel", label: "Traditionnel", hint: "Restaurant, brasserie, bistrot, pizzeria de quartier" },
  { code: "collective", label: "Collective", hint: "Sodexo, Elior, cuisines centrales, cantines, EHPAD" },
  { code: "hotel_traiteur", label: "Hôtel / traiteur", hint: "Restaurant d'hôtel, petit-déjeuner, traiteur, événementiel" },
  { code: "snacking", label: "Snacking / dark kitchen", hint: "Boulangerie-snacking, sandwicherie, cuisine de livraison" },
  { code: "hors_restauration", label: "Hors restauration", hint: "BTP, commerce, aide à domicile… on ne jette rien" },
  { code: "inconnu", label: "À préciser", hint: "Segment pas encore connu" },
] as const;
export type LeadSegment = (typeof LEAD_SEGMENTS)[number]["code"];
export const LEAD_SEGMENT_CODES = LEAD_SEGMENTS.map((s) => s.code) as [LeadSegment, ...LeadSegment[]];
export function segmentLabel(code: string | null | undefined): string {
  return LEAD_SEGMENTS.find((s) => s.code === code)?.label ?? "À préciser";
}

export const LEAD_OFFERS = [
  { code: "poei", label: "POEI", hint: "Le restaurant recrute : formation avant embauche financée par France Travail" },
  { code: "fle", label: "FLE cuisine / salle", hint: "Salariés en poste : français du restaurant" },
  { code: "akto", label: "Plan AKTO", hint: "Financement OPCO des formations des salariés" },
  { code: "haccp", label: "HACCP", hint: "Hygiène alimentaire obligatoire (14 h) avec Mehdi" },
] as const;
export type LeadOffer = (typeof LEAD_OFFERS)[number]["code"];
export const LEAD_OFFER_CODES = LEAD_OFFERS.map((s) => s.code) as [LeadOffer, ...LeadOffer[]];
export function offerLabel(code: string | null | undefined): string {
  return LEAD_OFFERS.find((s) => s.code === code)?.label ?? "—";
}

export const LEAD_SOURCES = [
  { code: "formulaire_meta", label: "Formulaire Meta (parlerresto)" },
  { code: "site", label: "Site web" },
  { code: "appel_entrant", label: "Appel entrant" },
  { code: "recommandation", label: "Recommandation" },
  { code: "terrain", label: "Terrain / visite" },
  { code: "autre", label: "Autre" },
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number]["code"];
export const LEAD_SOURCE_CODES = LEAD_SOURCES.map((s) => s.code) as [LeadSource, ...LeadSource[]];
export function sourceLabel(code: string | null | undefined): string {
  return LEAD_SOURCES.find((s) => s.code === code)?.label ?? "—";
}

// Contrat de sortie POEI (règles France Travail vérifiées 09/2026) : CDI, CDD ≥ 6 mois,
// saisonnier ≥ 4 mois, CDI intérimaire, intérim 6 mois sur 9. Extras et CDD courts : non.
export const CONTRACT_TYPES = [
  { code: "cdi", label: "CDI", eligible: true },
  { code: "cdd_6m", label: "CDD ≥ 6 mois", eligible: true },
  { code: "saisonnier_4m", label: "Saisonnier ≥ 4 mois", eligible: true },
  { code: "cdii", label: "CDI intérimaire", eligible: true },
  { code: "interim", label: "Intérim 6 mois sur 9", eligible: true },
  { code: "extras", label: "Extras", eligible: false },
  { code: "cdd_court", label: "CDD < 6 mois", eligible: false },
  { code: "autre", label: "Autre", eligible: null },
  { code: "inconnu", label: "Pas encore demandé", eligible: null },
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number]["code"];
export const CONTRACT_TYPE_CODES = CONTRACT_TYPES.map((s) => s.code) as [ContractType, ...ContractType[]];
export function contractLabel(code: string | null | undefined): string {
  return CONTRACT_TYPES.find((s) => s.code === code)?.label ?? "—";
}
// true = éligible POEI, false = non éligible (→ cascade), null = pas encore connu.
export function contractEligible(code: string | null | undefined): boolean | null {
  return CONTRACT_TYPES.find((s) => s.code === code)?.eligible ?? null;
}

export const HIRING_HORIZONS = [
  { code: "lt_1m", label: "Sous 1 mois", soon: true },
  { code: "1_3m", label: "1 à 3 mois", soon: true },
  { code: "3_6m", label: "3 à 6 mois", soon: false },
  { code: "gt_6m", label: "Plus de 6 mois", soon: false },
  { code: "inconnu", label: "Pas encore connue", soon: false },
] as const;
export type HiringHorizon = (typeof HIRING_HORIZONS)[number]["code"];
export const HIRING_HORIZON_CODES = HIRING_HORIZONS.map((s) => s.code) as [HiringHorizon, ...HiringHorizon[]];
export function horizonLabel(code: string | null | undefined): string {
  return HIRING_HORIZONS.find((s) => s.code === code)?.label ?? "—";
}

export const HACCP_STATUSES = [
  { code: "oui", label: "À jour" },
  { code: "non", label: "Personne formée / plus en règle" },
  { code: "inconnu", label: "Pas demandé" },
] as const;
export const HACCP_STATUS_CODES = ["oui", "non", "inconnu"] as const;

export const EVENT_KINDS = [
  { code: "appel", label: "Appel" },
  { code: "sms", label: "SMS" },
  { code: "whatsapp", label: "WhatsApp" },
  { code: "email", label: "Email" },
  { code: "rdv", label: "Rendez-vous" },
  { code: "note", label: "Note" },
  { code: "statut", label: "Changement de statut" },
  { code: "import", label: "Import" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["code"];
export const EVENT_KIND_CODES = EVENT_KINDS.map((s) => s.code) as [EventKind, ...EventKind[]];
export function eventKindLabel(code: string | null | undefined): string {
  return EVENT_KINDS.find((s) => s.code === code)?.label ?? code ?? "—";
}

export const EVENT_OUTCOMES = [
  { code: "joint", label: "Joint — a parlé au décideur" },
  { code: "messagerie", label: "Messagerie (vocal + SMS)" },
  { code: "barrage", label: "Barrage — pas le décideur" },
  { code: "rappel_convenu", label: "Rappel convenu à une heure précise" },
  { code: "envoye", label: "Message envoyé" },
  { code: "refus", label: "Refus" },
  { code: "rdv_pose", label: "RDV posé" },
  { code: "rdv_tenu", label: "RDV tenu" },
  { code: "no_show", label: "RDV manqué (no-show)" },
  { code: "autre", label: "Autre" },
] as const;
export type EventOutcome = (typeof EVENT_OUTCOMES)[number]["code"];
export const EVENT_OUTCOME_CODES = EVENT_OUTCOMES.map((s) => s.code) as [EventOutcome, ...EventOutcome[]];
export function eventOutcomeLabel(code: string | null | undefined): string {
  return EVENT_OUTCOMES.find((s) => s.code === code)?.label ?? code ?? "";
}

// Statut suggéré après un contact (modifiable dans le dialog) : jamais de recul automatique.
export function suggestedLeadStatus(outcome: EventOutcome, current: string | null | undefined): LeadStatus {
  const cur = (LEAD_STATUSES.find((s) => s.code === current) ?? LEAD_STATUSES[0]);
  if (cur.final) return cur.code;
  const candidate: LeadStatus = (() => {
    switch (outcome) {
      case "joint":
        return "contacte";
      case "messagerie":
      case "barrage":
      case "rappel_convenu":
      case "envoye":
        return "a_rappeler";
      case "refus":
        return "perdu";
      case "rdv_pose":
        return "rdv_pris";
      case "rdv_tenu":
        return "rdv_tenu";
      case "no_show":
        return "a_rappeler";
      default:
        return cur.code;
    }
  })();
  const cand = LEAD_STATUSES.find((s) => s.code === candidate)!;
  // Une messagerie sur un lead déjà « qualifié » ne le fait pas reculer ; un refus sort toujours.
  if (cand.final) return cand.code;
  return cand.rank >= cur.rank ? cand.code : cur.code;
}

export const RDV_MODES = [
  { code: "telephone", label: "Par téléphone" },
  { code: "sur_site", label: "Dans le restaurant" },
  { code: "visio", label: "En visio" },
] as const;
export type RdvMode = (typeof RDV_MODES)[number]["code"];
export const RDV_MODE_CODES = RDV_MODES.map((s) => s.code) as [RdvMode, ...RdvMode[]];
export function rdvModeLabel(code: string | null | undefined): string {
  return RDV_MODES.find((s) => s.code === code)?.label ?? "—";
}

export const LOST_REASONS = [
  "Injoignable après 5 tentatives",
  "Extras uniquement (pas de contrat éligible)",
  "Temps partiel non éligible",
  "Timing (pas de besoin avant 6 mois)",
  "A choisi un autre organisme",
  "Refus du dispositif",
  "Établissement fermé / en liquidation",
  "Autre",
] as const;

// Montant potentiel d'une convention POEI : tarif validé 11 €/h × 450 h par apprenant.
export const POEI_HOURS = 450;
export const POEI_RATE_PER_HOUR = 11;
export const POEI_AMOUNT_PER_LEARNER = POEI_HOURS * POEI_RATE_PER_HOUR; // 4 950 €
export function potentialAmount(positionsCount: number | null | undefined): number {
  return Math.max(0, positionsCount ?? 0) * POEI_AMOUNT_PER_LEARNER;
}

export function leadRef(no: number | null | undefined): string {
  return no == null ? "—" : `L-${String(no).padStart(4, "0")}`;
}

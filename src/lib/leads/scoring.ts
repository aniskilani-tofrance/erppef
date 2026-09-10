import { contractEligible, HIRING_HORIZONS, type LeadScore } from "@/lib/leads/status";

// Score suggéré d'après la qualification (playbook v4 §4). Suggestion : le setter garde
// la main dans le dialog, mais on ne laisse jamais une fiche qualifiée sans score.
//   Chaud  = au moins 1 poste ferme + échéance < 3 mois + contrat éligible + décideur au téléphone
//   Tiède  = besoin réel mais échéance floue, contrat à vérifier (temps partiel, inconnu) ou décideur à joindre
//   Froid  = curiosité, extras uniquement, pas de poste identifié
export type ScoringInput = {
  positionsCount: number | null | undefined;
  hiringHorizon: string | null | undefined;
  contractType: string | null | undefined;
  decisionMaker: boolean | null | undefined;
};

export function suggestScore(i: ScoringInput): LeadScore {
  const positions = i.positionsCount ?? 0;
  const eligible = contractEligible(i.contractType);
  if (positions <= 0 || eligible === false) return "froid";
  const soon = HIRING_HORIZONS.find((h) => h.code === i.hiringHorizon)?.soon ?? false;
  if (soon && eligible === true && i.decisionMaker === true) return "chaud";
  const horizonKnown = i.hiringHorizon && i.hiringHorizon !== "inconnu";
  if (!horizonKnown && eligible === null && i.decisionMaker == null) return "froid";
  return "tiede";
}

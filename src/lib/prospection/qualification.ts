// Statut du lead créé depuis la prospection : « Qualifié » quand le besoin est connu
// (au moins un poste, un contrat et une échéance renseignés), sinon « Contacté ».
export function qualifiedLeadStatus(lead: {
  positionsCount?: number | null;
  contractType?: string | null;
  hiringHorizon?: string | null;
}): "qualifie" | "contacte" {
  const known = (v: string | null | undefined) => Boolean(v) && v !== "inconnu";
  return (lead.positionsCount ?? 0) > 0 && known(lead.contractType) && known(lead.hiringHorizon) ? "qualifie" : "contacte";
}

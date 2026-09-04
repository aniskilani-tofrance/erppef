// Message d'invitation au test de positionnement, copié dans le presse-papiers avec
// le lien (WhatsApp / SMS / email). Texte dicté par Anis le 04/09/2026 : vouvoiement,
// phrases courtes (destinataires en cours d'apprentissage du français), consignes
// pratiques (calme, téléphone chargé, son au maximum), durée annoncée 5 à 35 min.

const ORG_NAME = "Parler Emploi Formation";

export function buildPlacementInvitation({
  url,
  senderFirstName,
}: {
  url: string;
  senderFirstName: string | null;
}): string {
  const name = senderFirstName?.trim() || null;
  const intro = name
    ? `Je suis ${name} de ${ORG_NAME}.`
    : `Je vous écris de la part de ${ORG_NAME}.`;
  const signature = name ?? `L'équipe ${ORG_NAME}`;

  return [
    "Bonjour,",
    "",
    `${intro} Je me permets de vous contacter suite à votre demande de suivi des cours de français.`,
    "",
    "Voici votre lien pour passer le test de positionnement :",
    url,
    "",
    "Ce n'est pas une évaluation : nous voulons simplement connaître votre niveau réel.",
    "",
    "Mettez-vous dans de bonnes conditions : au calme, avec votre téléphone chargé et le son au maximum pour bien entendre. Le test peut durer entre 5 et 35 minutes.",
    "",
    "Vous allez être convoqué(e) — ou l'avez déjà été — à une réunion de rentrée à la suite du test.",
    "",
    "Bon courage,",
    signature,
  ].join("\n");
}

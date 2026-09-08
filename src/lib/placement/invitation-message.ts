// Message d'invitation au test de positionnement (WhatsApp / SMS / email).
// Texte dicté par Anis le 04/09/2026 : vouvoiement, phrases courtes, consignes
// pratiques (calme, téléphone chargé, son au maximum), durée annoncée 5 à 35 min.
// Le modèle vit dans src/lib/admission/templates.ts (étape « test_positionnement »),
// retouchable par la coordination dans Admission → « Messages ».

import { baseVars, buildStageMessage, DEFAULT_TEMPLATES, type Templates } from "@/lib/admission/templates";

export function buildPlacementInvitation({
  url,
  senderFirstName,
  learnerFirstName = null,
  templates = DEFAULT_TEMPLATES,
}: {
  url: string;
  senderFirstName: string | null;
  learnerFirstName?: string | null;
  templates?: Templates;
}): string {
  return buildStageMessage(
    "test_positionnement",
    { ...baseVars(learnerFirstName, senderFirstName), lien: url },
    templates,
  );
}

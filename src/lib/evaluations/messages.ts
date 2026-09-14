import type { EvaluationKind } from "@/lib/evaluations/grid";

// Message d'invitation au test de mi-parcours / finale (WhatsApp, copier-coller).
export function buildEvaluationInvitation(input: { firstName: string; kind: EvaluationKind; url: string; senderFirstName?: string | null }): string {
  const what = input.kind === "finale" ? "petit test de fin de formation" : "petit test de mi-parcours";
  return [
    `Bonjour ${input.firstName},`,
    `Voici ton ${what} de français : ${input.url}`,
    "Il dure 15 à 20 minutes. Tu peux le faire sur ton téléphone, au calme, avec le son. Il n'y a pas de piège : c'est pour voir tes progrès.",
    input.senderFirstName ? `À bientôt, ${input.senderFirstName} — ParlerEmploi Formation` : "À bientôt — ParlerEmploi Formation",
  ].join("\n");
}

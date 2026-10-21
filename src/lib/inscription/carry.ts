import type { SignupValues } from "@/app/inscription/actions";

// Formulaire d'inscription en écrans successifs : avec JavaScript, seul l'écran affiché
// est dans la page. Les réponses des autres écrans partent donc en champs cachés avec
// l'envoi — sans eux, le serveur ne reçoit que le consentement et renvoie « Écrivez votre
// prénom et votre nom ». L'écran affiché envoie ses propres champs.
export function carriedEntries(values: SignupValues, shownStep: string): [string, string][] {
  const out: [string, string][] = [];
  if (shownStep !== "name") out.push(["firstName", values.firstName], ["lastName", values.lastName]);
  if (shownStep !== "phone") out.push(["phone", values.phone]);
  if (shownStep !== "languages") for (const code of values.languages) out.push(["languages", code]);
  if (shownStep !== "french" && values.french) out.push(["french", values.french]);
  if (shownStep !== "availability") for (const code of values.availability) out.push(["availability", code]);
  if (shownStep !== "city") out.push(["city", values.city]);
  if (shownStep !== "consent" && values.consent) out.push(["consent", "on"]);
  return out;
}

import type { SignupValues } from "@/app/inscription/actions";

// Formulaire d'inscription en écrans successifs : avec JavaScript, seul l'écran affiché
// est dans la page. Les réponses des autres écrans partent donc en champs cachés avec
// l'envoi — sans eux, le serveur ne reçoit que le consentement et renvoie « Écrivez votre
// prénom et votre nom ». L'écran affiché envoie ses propres champs.
export function carriedEntries(values: SignupValues, shownStep: string): [string, string][] {
  const out: [string, string][] = [];
  if (shownStep !== "name") out.push(["firstName", values.firstName], ["lastName", values.lastName]);
  if (shownStep !== "phone") out.push(["phone", values.phone]);
  if (shownStep !== "french" && values.french) out.push(["french", values.french]);
  if (shownStep !== "city") {
    if (values.cityChoice) out.push(["cityChoice", values.cityChoice]);
    if (values.cityChoice === "autre" && values.city.trim()) out.push(["city", values.city]);
  }
  if (shownStep !== "consent" && values.consent) out.push(["consent", "on"]);
  return out;
}

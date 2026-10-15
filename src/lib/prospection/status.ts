// Prospection à froid : statuts d'un prospect et résultats d'appel.
// Un prospect n'a rien demandé : pas de cadence J0 → J10, pas de message automatique.
// On déroule la liste, un résultat par appel, et l'intérêt exprimé crée un lead.

export const PROSPECT_STATUSES = [
  { code: "a_appeler", label: "À appeler", open: true, hint: "Jamais appelé" },
  { code: "pas_joint", label: "Pas joint", open: true, hint: "Personne n'a décroché : on réessaie à un autre créneau" },
  { code: "barrage", label: "Barrage", open: true, hint: "Un employé a répondu : rappeler le gérant" },
  { code: "rappeler", label: "Rappel prévu", open: true, hint: "Le décideur a demandé qu'on le rappelle" },
  { code: "interesse", label: "Intéressé → lead", open: false, hint: "Besoin exprimé : suivi dans les leads" },
  { code: "pas_de_besoin", label: "Pas de besoin", open: false, hint: "Ne recrute pas en ce moment" },
  { code: "injoignable", label: "Injoignable", open: false, hint: "Aucune réponse après plusieurs essais" },
  { code: "ne_plus_appeler", label: "Ne plus appeler", open: false, hint: "Opposition : ne jamais rappeler ni réimporter" },
  { code: "hors_service", label: "Numéro faux / fermé", open: false, hint: "Numéro erroné ou restaurant fermé" },
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]["code"];
export const PROSPECT_STATUS_CODES = PROSPECT_STATUSES.map((s) => s.code) as [ProspectStatus, ...ProspectStatus[]];

export function prospectStatusLabel(code: string | null | undefined): string {
  return PROSPECT_STATUSES.find((s) => s.code === code)?.label ?? "À appeler";
}
export function isOpenProspect(code: string | null | undefined): boolean {
  return PROSPECT_STATUSES.find((s) => s.code === code)?.open ?? false;
}

export function prospectStatusBadgeClass(code: string | null | undefined): string {
  switch (code) {
    case "pas_joint":
      return "border-zinc-300 bg-zinc-50 text-zinc-700";
    case "barrage":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "rappeler":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "interesse":
      return "border-emerald-400 bg-emerald-100 text-emerald-900";
    case "pas_de_besoin":
    case "injoignable":
    case "hors_service":
      return "border-zinc-300 bg-zinc-100 text-zinc-500";
    case "ne_plus_appeler":
      return "border-red-300 bg-red-50 text-red-700";
    default:
      return "border-violet-300 bg-violet-50 text-violet-800"; // à appeler
  }
}

// Les boutons de l'écran d'appel, dans l'ordre où on les cherche du pouce.
export const CALL_OUTCOMES = [
  { code: "pas_de_reponse", label: "Pas de réponse", hint: "Sonne dans le vide ou messagerie (on ne laisse pas de message)" },
  { code: "barrage", label: "Barrage", hint: "Un employé répond, le gérant n'est pas là" },
  { code: "rappeler", label: "Rappeler le…", hint: "Le décideur demande qu'on le rappelle à une date" },
  { code: "interesse", label: "Intéressé", hint: "Il recrute ou va recruter : on crée le lead" },
  { code: "pas_de_besoin", label: "Pas de besoin", hint: "Ne recrute pas" },
  { code: "numero_faux", label: "Numéro faux / fermé", hint: "Mauvais numéro ou restaurant fermé" },
  { code: "ne_plus_appeler", label: "Ne plus appeler", hint: "Il demande à ne plus être appelé" },
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number]["code"];
export const CALL_OUTCOME_CODES = CALL_OUTCOMES.map((o) => o.code) as [CallOutcome, ...CallOutcome[]];

export function callOutcomeLabel(code: string | null | undefined): string {
  if (code === "note") return "Note";
  return CALL_OUTCOMES.find((o) => o.code === code)?.label.replace("…", "") ?? "—";
}

// Après MAX_ATTEMPTS appels sans personne au bout du fil, on arrête : injoignable.
export const MAX_ATTEMPTS = 5;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Prochain jour ouvré (lundi → vendredi) après `date`.
export function nextWorkingDay(date: string): string {
  let d = addDays(date, 1);
  for (;;) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) return d;
    d = addDays(d, 1);
  }
}

export type CallTransition = {
  status: ProspectStatus;
  callbackOn: string | null;
  createsLead: boolean;
};

// Ce que devient le prospect après un appel. `attemptsAfter` compte l'appel qu'on note.
// Pas joint / barrage sans date : on réessaie le jour ouvré suivant (à l'autre créneau).
export function transitionFor(
  outcome: CallOutcome,
  attemptsAfter: number,
  today: string,
  callbackOn?: string | null,
): CallTransition {
  switch (outcome) {
    case "pas_de_reponse":
      return attemptsAfter >= MAX_ATTEMPTS
        ? { status: "injoignable", callbackOn: null, createsLead: false }
        : { status: "pas_joint", callbackOn: nextWorkingDay(today), createsLead: false };
    case "barrage":
      return { status: "barrage", callbackOn: callbackOn || nextWorkingDay(today), createsLead: false };
    case "rappeler":
      return { status: "rappeler", callbackOn: callbackOn || nextWorkingDay(today), createsLead: false };
    case "interesse":
      return { status: "interesse", callbackOn: null, createsLead: true };
    case "pas_de_besoin":
      return { status: "pas_de_besoin", callbackOn: null, createsLead: false };
    case "numero_faux":
      return { status: "hors_service", callbackOn: null, createsLead: false };
    case "ne_plus_appeler":
      return { status: "ne_plus_appeler", callbackOn: null, createsLead: false };
  }
}

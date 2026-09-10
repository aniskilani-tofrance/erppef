// Cadence de relance du kit Shahzad (scripts §7) : J0 appel + SMS · J1 appel à un autre
// créneau · J3 email de relance · J6 appel + SMS « dernière tentative » · J10 email de
// rupture « je ferme votre dossier ? » · après J10 sans réponse : Perdu (injoignable).
// Toutes les dates sont des jours calendaires 'YYYY-MM-DD' (heure de Paris côté appelant).

export type CadenceInput = {
  status: string;
  attempts: number;
  firstContactOn: string | null; // 'YYYY-MM-DD' du premier contact tenté
  rdvOn: string | null; // 'YYYY-MM-DD' du RDV posé
  rdvReminderSent: boolean;
  today: string; // 'YYYY-MM-DD'
};

export type NextAction = {
  label: string;
  on: string; // 'YYYY-MM-DD' — quand
  kind: "appel" | "sms" | "email" | "rdv" | "cloture" | "suivi";
  overdue: boolean;
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const RELANCE_STEPS: { attempts: number; offsetDays: number; label: string; kind: NextAction["kind"] }[] = [
  { attempts: 1, offsetDays: 1, label: "J1 — rappeler à un autre créneau (matin ↔ coupure)", kind: "appel" },
  { attempts: 2, offsetDays: 3, label: "J3 — email de relance n°3", kind: "email" },
  { attempts: 3, offsetDays: 6, label: "J6 — appel + SMS « dernière tentative »", kind: "sms" },
  { attempts: 4, offsetDays: 10, label: "J10 — email de rupture « je ferme votre dossier ? »", kind: "email" },
];

export function suggestNextAction(i: CadenceInput): NextAction | null {
  const done = (on: string, label: string, kind: NextAction["kind"]): NextAction => ({
    label,
    on,
    kind,
    overdue: on < i.today,
  });

  switch (i.status) {
    case "gagne":
    case "perdu":
    case "hors_cible":
      return null;
    case "rdv_pris": {
      if (!i.rdvOn) return done(i.today, "Confirmer la date du RDV (email n°1)", "rdv");
      if (i.rdvOn < i.today) return done(i.today, "RDV passé : noter tenu ou no-show", "rdv");
      if (i.rdvReminderSent) return done(i.rdvOn, "RDV avec la direction", "rdv");
      const veille = addDays(i.rdvOn, -1);
      return done(veille < i.today ? i.today : veille, "SMS de rappel la veille du RDV (SMS n°3)", "sms");
    }
    case "rdv_tenu":
      return done(addDays(i.today, 0), "Prévenir la direction : proposition à envoyer", "suivi");
    case "proposition":
      return done(addDays(i.today, 3), "Relancer la proposition (direction)", "suivi");
    case "contacte":
    case "qualifie":
      return done(i.today, "Proposer deux créneaux hors service et poser le RDV", "rdv");
    default: {
      // nouveau / a_rappeler : la cadence J0 → J10
      if (i.attempts <= 0 || !i.firstContactOn) {
        return done(i.today, "J0 — appel de qualification + SMS si messagerie", "appel");
      }
      const step = RELANCE_STEPS.find((s) => s.attempts === i.attempts);
      if (!step) return done(i.today, "5 tentatives sans réponse : classer « Perdu — injoignable »", "cloture");
      const on = addDays(i.firstContactOn, step.offsetDays);
      return done(on < i.today ? i.today : on, step.label, step.kind);
    }
  }
}

// Délai de premier rappel (KPI « rappelé sous 24 h ») en heures, null si jamais contacté.
export function hoursToFirstContact(receivedAt: string, firstContactAt: string | null): number | null {
  if (!firstContactAt) return null;
  return (Date.parse(firstContactAt) - Date.parse(receivedAt)) / 3_600_000;
}

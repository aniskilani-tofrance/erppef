import { describe, expect, it } from "vitest";
import {
  SEQUENCES,
  SEQUENCE_KINDS,
  addBusinessDays,
  isSequenceTask,
  nextStepAfter,
  planAfter,
  spaced,
  staleReason,
  stepDueAt,
  transitionForOutcome,
  transitionForStatus,
} from "@/lib/leads/sequences";
import { BREVO_LEAD_EVENTS, brevoMessageFor, type LeadForBrevo } from "@/lib/leads/brevo";
import { DEFAULT_LEAD_SETTINGS, SMS_TEMPLATES, leadVars, renderEmail } from "@/lib/leads/templates";
import { deferredSmsCode } from "@/lib/leads/automations";

// Les séquences sont la cadence du kit Shahzad rendue automatique. Ces tests verrouillent
// les définitions (étapes, délais), le calcul des dates (10 h Paris, jamais le week-end,
// jamais deux étapes le même jour) et les règles d'arrêt, sans toucher à la base.

const lead: LeadForBrevo = {
  id: "8b6f4a1e-0c2d-4e5f-9a7b-1c2d3e4f5a6b",
  lead_no: 12,
  company: "Le Bistrot des Docks",
  contact_name: "Karim Benali",
  email: "karim@bistrotdesdocks.fr",
  phone: "+33612345678",
  city: "Saint-Ouen",
  postal_code: "93400",
  positions: "commis de cuisine",
  positions_count: 1,
  segment: "traditionnel",
  status: "a_rappeler",
  rdv_at: null,
  rdv_mode: null,
};

// Heure d'été à Paris jusqu'au 25/10/2026 : 10 h = 08:00 UTC ; ensuite 10 h = 09:00 UTC.
const LUNDI_28_09 = "2026-09-28T09:15:00.000Z"; // lundi 11h15 à Paris

describe("définitions des séquences", () => {
  it("les quatre séquences portent les délais demandés", () => {
    expect(SEQUENCE_KINDS).toEqual(["injoignable", "no_show", "proposition", "nurturing"]);
    expect(SEQUENCES.injoignable.steps.map((s) => [s.code, s.offsetDays])).toEqual([["j1", 1], ["j3", 3], ["j6", 6], ["j10", 10]]);
    expect(SEQUENCES.no_show.steps.map((s) => [s.code, s.offsetDays])).toEqual([["j1", 1], ["j3", 3]]);
    expect(SEQUENCES.proposition.steps.map((s) => [s.code, s.offsetDays, Boolean(s.businessDays)])).toEqual([["j2", 2, true], ["j7", 7, false]]);
    expect(SEQUENCES.nurturing.steps.map((s) => [s.code, s.offsetDays])).toEqual([["j30", 30], ["j60", 60], ["j90", 90]]);
  });

  it("l'injoignable enchaîne tâche d'appel, e-mail, SMS, e-mail de rupture", () => {
    const [j1, j3, j6, j10] = SEQUENCES.injoignable.steps;
    expect(j1.actions).toEqual([]);
    expect(j3.actions).toEqual([{ type: "email", event: BREVO_LEAD_EVENTS.relanceJ3 }]);
    expect(j6.actions).toEqual([{ type: "sms", code: "derniere_tentative" }]);
    expect(j10.actions).toEqual([{ type: "email", event: BREVO_LEAD_EVENTS.dernierMessage }]);
  });

  it("chaque action renvoie à un modèle qui existe et se rend sans trou", () => {
    const vars = leadVars(lead, DEFAULT_LEAD_SETTINGS, null);
    for (const def of Object.values(SEQUENCES)) {
      for (const step of def.steps) {
        for (const action of step.actions) {
          if (action.type === "email") {
            expect(Object.values(BREVO_LEAD_EVENTS)).toContain(action.event);
            const mail = brevoMessageFor(action.event, lead, DEFAULT_LEAD_SETTINGS);
            expect(mail.subject.length, `${def.kind}/${step.code}`).toBeGreaterThan(10);
            expect(mail.body.startsWith("Bonjour Karim")).toBe(true);
            expect(mail.body).not.toMatch(/\{[a-z_]+\}/); // aucune variable non rendue
          } else {
            expect(SMS_TEMPLATES.map((t) => t.code)).toContain(action.code);
          }
        }
      }
    }
    void vars;
  });

  it("les e-mails de veille respectent les lignes rouges et laissent une porte de sortie", () => {
    const vars = leadVars(lead, DEFAULT_LEAD_SETTINGS, null);
    for (const code of ["nurturing_j30", "nurturing_j60", "nurturing_j90"] as const) {
      const mail = renderEmail(code, vars);
      expect(mail.body).not.toMatch(/100 ?% gratuit|aucun engagement|AKTO|titre de séjour/i);
      expect(mail.body).toMatch(/stop/i);
      expect(mail.body).toContain(DEFAULT_LEAD_SETTINGS.calendlyUrl);
    }
  });

  it("les libellés d'étape ne déclenchent pas par erreur le SMS de confirmation de créneau", () => {
    // deferredSmsCode envoie « qualification_reservee » quand la prochaine action parle de
    // Calendly ou de qualification : une tâche de séquence ne doit jamais ressembler à ça.
    for (const def of Object.values(SEQUENCES)) {
      for (const step of def.steps) {
        expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: null, next_action: step.label })).toBeNull();
      }
      expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: null, next_action: def.end.task })).toBeNull();
    }
  });

  it("reconnaît une prochaine action posée par une séquence", () => {
    expect(isSequenceTask(SEQUENCES.injoignable.steps[0].label)).toBe(true);
    expect(isSequenceTask(SEQUENCES.nurturing.end.task)).toBe(true);
    expect(isSequenceTask("Rappeler à la coupure")).toBe(false);
    expect(isSequenceTask(null)).toBe(false);
  });
});

describe("échéances : 10 h Paris, jamais le week-end, J+2 ouvré", () => {
  it("date chaque étape depuis T0 à 10 h de Paris", () => {
    expect(stepDueAt(LUNDI_28_09, SEQUENCES.injoignable.steps[0])).toBe("2026-09-29T08:00:00.000Z"); // mardi
    expect(stepDueAt(LUNDI_28_09, SEQUENCES.injoignable.steps[1])).toBe("2026-10-01T08:00:00.000Z"); // jeudi
    expect(stepDueAt(LUNDI_28_09, SEQUENCES.injoignable.steps[3])).toBe("2026-10-08T08:00:00.000Z"); // jeudi
  });

  it("décale au lundi une étape qui tombe le week-end", () => {
    // J+6 depuis le lundi 28/09 = dimanche 04/10 → lundi 05/10
    expect(stepDueAt(LUNDI_28_09, SEQUENCES.injoignable.steps[2])).toBe("2026-10-05T08:00:00.000Z");
    // no-show constaté un vendredi : J+1 = samedi → lundi
    expect(stepDueAt("2026-10-02T15:30:00.000Z", SEQUENCES.no_show.steps[0])).toBe("2026-10-05T08:00:00.000Z");
  });

  it("compte J+2 ouvré en jours de semaine", () => {
    expect(addBusinessDays("2026-10-01", 2)).toBe("2026-10-05"); // jeudi → lundi
    expect(addBusinessDays("2026-09-28", 2)).toBe("2026-09-30"); // lundi → mercredi
    expect(stepDueAt("2026-10-01T16:00:00.000Z", SEQUENCES.proposition.steps[0])).toBe("2026-10-05T08:00:00.000Z");
  });

  it("suit le passage à l'heure d'hiver", () => {
    // T0 le 27/10 (heure d'hiver depuis le 25/10) : 10 h Paris = 09:00 UTC
    expect(stepDueAt("2026-10-27T10:00:00.000Z", SEQUENCES.injoignable.steps[0])).toBe("2026-10-28T09:00:00.000Z");
    // T0 en heure d'été, J+30 en heure d'hiver : toujours 10 h Paris
    expect(stepDueAt(LUNDI_28_09, SEQUENCES.nurturing.steps[0])).toBe("2026-10-28T09:00:00.000Z");
  });

  it("une échéance dépassée part au prochain créneau d'envoi, jamais dans le passé", () => {
    const mardiMidi = new Date("2026-09-29T12:00:00.000Z");
    expect(spaced("2026-09-29T08:00:00.000Z", mardiMidi)).toBe("2026-09-30T08:00:00.000Z");
    expect(spaced("2026-10-02T08:00:00.000Z", mardiMidi)).toBe("2026-10-02T08:00:00.000Z"); // encore à venir : inchangée
    const vendrediMidi = new Date("2026-10-02T12:00:00.000Z");
    expect(spaced("2026-10-02T08:00:00.000Z", vendrediMidi)).toBe("2026-10-05T08:00:00.000Z"); // lundi
  });

  it("planifie l'étape suivante puis la tâche de fin", () => {
    const def = SEQUENCES.injoignable;
    const now = new Date(LUNDI_28_09);
    const first = planAfter(def, LUNDI_28_09, null, now);
    expect(first.finished).toBe(false);
    if (!first.finished) expect([first.step.code, first.dueAt]).toEqual(["j1", "2026-09-29T08:00:00.000Z"]);
    const afterJ10 = planAfter(def, LUNDI_28_09, "j10", new Date("2026-10-08T08:05:00.000Z"));
    expect(afterJ10.finished).toBe(true);
    if (afterJ10.finished) expect(afterJ10).toEqual({ finished: true, task: def.end.task, dueAt: "2026-10-12T08:00:00.000Z" }); // J+12 = samedi 10/10 → lundi 12/10
    expect(nextStepAfter(def, "j10")).toBeNull();
    expect(nextStepAfter(def, "inconnue")?.code).toBe("j1"); // une étape inconnue repart du début
  });
});

describe("règles de démarrage et d'arrêt", () => {
  it("les statuts pilotent les séquences", () => {
    expect(transitionForStatus("proposition")).toEqual({ start: "proposition" });
    expect(transitionForStatus("nurturing")).toEqual({ start: "nurturing" });
    expect(transitionForStatus("rdv_pris")).toEqual({ stop: "reservation" });
    expect(transitionForStatus("rdv_tenu")).toEqual({ stop: "rdv_tenu" });
    expect(transitionForStatus("contacte")).toEqual({ stop: "reponse" });
    expect(transitionForStatus("qualifie")).toEqual({ stop: "reponse" });
    for (const s of ["gagne", "perdu", "hors_cible"]) expect(transitionForStatus(s)).toEqual({ stop: "besoin_clos" });
    expect(transitionForStatus("nouveau")).toBeNull();
    expect(transitionForStatus("a_rappeler")).toBeNull();
  });

  it("les résultats d'appel démarrent l'injoignable ou arrêtent tout", () => {
    expect(transitionForOutcome("appel", "messagerie", "nouveau")).toEqual({ startIfNone: "injoignable" });
    expect(transitionForOutcome("appel", "barrage", "a_rappeler")).toEqual({ startIfNone: "injoignable" });
    expect(transitionForOutcome("appel", "messagerie", "qualifie")).toBeNull(); // déjà qualifié : pas d'injoignable
    expect(transitionForOutcome("sms", "messagerie", "nouveau")).toBeNull(); // seul un appel compte
    expect(transitionForOutcome("appel", "joint", "a_rappeler")).toEqual({ stop: "reponse" });
    expect(transitionForOutcome("appel", "rappel_convenu", "a_rappeler")).toEqual({ stop: "reponse" });
    expect(transitionForOutcome("rdv", "rdv_pose", "qualifie")).toEqual({ stop: "reservation" });
    expect(transitionForOutcome("rdv", "rdv_tenu", "rdv_pris")).toEqual({ stop: "rdv_tenu" });
    expect(transitionForOutcome("appel", "refus", "a_rappeler")).toEqual({ stop: "besoin_clos" });
    expect(transitionForOutcome("rdv", "no_show", "rdv_pris")).toEqual({ start: "no_show" });
    expect(transitionForOutcome("appel", "no_show", "rdv_pris")).toBeNull();
    expect(transitionForOutcome("appel", null, "nouveau")).toBeNull();
  });

  it("revérifie la fiche avant chaque étape", () => {
    expect(staleReason("injoignable", { status: "a_rappeler" })).toBeNull();
    expect(staleReason("injoignable", { status: "contacte" })).toBeNull();
    expect(staleReason("injoignable", { status: "qualifie" })).toBe("reponse");
    expect(staleReason("injoignable", { status: "rdv_pris" })).toBe("reservation");
    expect(staleReason("injoignable", { status: "perdu" })).toBe("besoin_clos");
    expect(staleReason("no_show", { status: "a_rappeler", rdv_outcome: "no_show" })).toBeNull();
    expect(staleReason("no_show", { status: "a_rappeler", rdv_outcome: "a_venir" })).toBe("reservation");
    expect(staleReason("no_show", { status: "rdv_tenu" })).toBe("rdv_tenu");
    expect(staleReason("proposition", { status: "proposition" })).toBeNull();
    expect(staleReason("proposition", { status: "nurturing" })).toBe("reponse");
    expect(staleReason("nurturing", { status: "nurturing" })).toBeNull();
    expect(staleReason("nurturing", { status: "gagne" })).toBe("besoin_clos");
  });

  it("l'opposition et les retours Brevo priment sur tout", () => {
    expect(staleReason("nurturing", { status: "nurturing", opt_out_at: "2026-09-29T10:00:00Z" })).toBe("opposition");
    expect(staleReason("injoignable", { status: "a_rappeler", email_status: "hard_bounce" })).toBe("bounce_dur");
    expect(staleReason("injoignable", { status: "a_rappeler", email_status: "unsubscribed" })).toBe("desinscription");
    expect(staleReason("injoignable", { status: "a_rappeler", email_status: "complaint" })).toBe("opposition");
    expect(staleReason("injoignable", { status: "a_rappeler", email_status: "delivered" })).toBeNull();
    expect(staleReason("injoignable", { status: "a_rappeler", email_status: "soft_bounce" })).toBeNull();
  });
});

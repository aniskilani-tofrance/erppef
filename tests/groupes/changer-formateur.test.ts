import { describe, expect, it } from "vitest";
import {
  appendTrace,
  changeStartMs,
  lastTrainerChangeTrace,
  planTrainerChange,
  previewHeadline,
  sessionLabel,
  summarizePlan,
  trainerChangeTrace,
  trainerChoices,
  withoutTrainerChangeTraces,
  type BusySession,
  type GroupSession,
} from "@/lib/groupes/changer-formateur";
import { newTrainerEmail, previousTrainerEmail } from "@/lib/groupes/changer-formateur-emails";

// Lundi 26 octobre 2026, 10h à Paris (heure d'hiver depuis la veille).
const NOW = new Date("2026-10-26T09:00:00Z");
const ANNE = "anne";
const MARIE = "marie";

// Atelier du lundi 14h30-17h45 (Paris).
function session(id: string, startsAt: string, over: Partial<GroupSession> = {}): GroupSession {
  const end = new Date(Date.parse(startsAt) + 3.25 * 3_600_000).toISOString();
  return { id, startsAt, endsAt: end, status: "planifiee", attendanceClosedAt: null, trainerId: MARIE, trainerName: "Marie Dupont", coTrainerId: null, ...over };
}

const SESSIONS: GroupSession[] = [
  session("passee", "2026-10-19T12:30:00Z", { attendanceClosedAt: null }), // lundi dernier, feuille oubliée
  session("ce-matin", "2026-10-26T08:00:00Z"), // déjà commencée
  session("aujourdhui", "2026-10-26T13:30:00Z"),
  session("coanimee", "2026-11-02T13:30:00Z", { coTrainerId: ANNE }),
  session("annulee", "2026-11-09T13:30:00Z", { status: "annulee" }),
  session("cloturee", "2026-11-16T13:30:00Z", { attendanceClosedAt: "2026-11-16T17:00:00Z" }),
  session("conge", "2026-11-23T13:30:00Z"),
  session("chevauchement", "2026-11-30T13:30:00Z", { trainerId: null, trainerName: null }),
  session("conge-a-valider", "2026-12-07T13:30:00Z"),
  session("deja-anne", "2026-12-14T13:30:00Z", { trainerId: ANNE, trainerName: "Anne Philippon" }),
];

const BUSY: BusySession[] = [
  { id: "autre", groupName: "A2 du soir", startsAt: "2026-11-30T15:00:00+00:00", endsAt: "2026-11-30T17:00:00+00:00", asCoTrainer: true },
];
const ABSENCES = [
  { trainer_id: ANNE, starts_on: "2026-11-20", ends_on: "2026-11-24", status: "approuvee" },
  { trainer_id: ANNE, starts_on: "2026-12-07", ends_on: "2026-12-07", status: "en_attente" },
  { trainer_id: ANNE, starts_on: "2026-12-21", ends_on: "2026-12-21", status: "refusee" },
  { trainer_id: MARIE, starts_on: "2026-10-26", ends_on: "2026-12-31", status: "approuvee" }, // le congé d'une autre ne compte pas
];

const plan = (over: Partial<Parameters<typeof planTrainerChange>[0]> = {}) =>
  planTrainerChange({
    sessions: SESSIONS,
    newTrainerId: ANNE,
    effectiveFrom: "2026-10-26",
    now: NOW,
    busy: BUSY,
    absences: ABSENCES,
    weeklyHoursMax: 35,
    availabilities: [],
    ...over,
  });

describe("séances concernées", () => {
  it("seulement à venir, planifiées, feuille non clôturée : passées, annulées et clôturées ne bougent jamais", () => {
    const p = plan();
    expect(p.toAssign.map((a) => a.sessionId)).toEqual(["aujourdhui", "coanimee"]);
    const touched = new Set([...p.toAssign.map((a) => a.sessionId), ...p.conflicts.map((c) => c.sessionId), ...p.alreadyAssigned]);
    for (const id of ["passee", "ce-matin", "annulee", "cloturee"]) expect(touched.has(id)).toBe(false);
  });

  it("la date d'effet : rien avant minuit (Paris) de ce jour-là", () => {
    const p = plan({ effectiveFrom: "2026-11-02" });
    expect(p.toAssign.map((a) => a.sessionId)).toEqual(["coanimee"]);
    // Minuit à Paris, jamais avant maintenant
    expect(changeStartMs("2026-11-02", NOW)).toBe(Date.parse("2026-11-01T23:00:00Z"));
    expect(changeStartMs("2026-10-26", NOW)).toBe(NOW.getTime());
  });

  it("une séance déjà à la nouvelle personne n'est ni changée ni en conflit", () => {
    expect(plan().alreadyAssigned).toEqual(["deja-anne"]);
  });

  it("garde l'ancien formateur de chaque séance (pour les emails et le message)", () => {
    expect(plan().toAssign[0]).toMatchObject({ sessionId: "aujourdhui", previousTrainerId: MARIE, removeCoTrainer: false });
  });
});

describe("co-animation", () => {
  it("si la nouvelle personne co-animait la séance, la co-animation est retirée", () => {
    const p = plan();
    expect(p.toAssign.find((a) => a.sessionId === "coanimee")!.removeCoTrainer).toBe(true);
    expect(p.toAssign.find((a) => a.sessionId === "aujourdhui")!.removeCoTrainer).toBe(false);
  });
});

describe("conflits", () => {
  it("congé validé, congé demandé et chevauchement : non confiés, listés avec la raison et qui garde la séance", () => {
    const p = plan();
    expect(p.conflicts.map((c) => [c.sessionId, c.kind])).toEqual([
      ["conge", "conge"],
      ["chevauchement", "chevauchement"],
      ["conge-a-valider", "conge_a_valider"],
    ]);
    const [conge, clash, pending] = p.conflicts;
    expect(conge.reason).toBe("en congé ce jour-là");
    expect(conge.keptTrainerName).toBe("Marie Dupont");
    expect(clash.reason).toBe("déjà en co-animation avec « A2 du soir » de 16h à 18h");
    expect(clash.keptTrainerId).toBeNull(); // reste « Non affecté »
    expect(pending.reason).toContain("pas encore validé");
  });

  it("chevauchement comme formatrice principale ailleurs ; un congé refusé ne bloque pas", () => {
    const p = plan({
      busy: [{ id: "x", groupName: "B1", startsAt: "2026-10-26T15:00:00Z", endsAt: "2026-10-26T16:00:00Z", asCoTrainer: false }],
      absences: [{ trainer_id: ANNE, starts_on: "2026-11-02", ends_on: "2026-11-02", status: "refusee" }],
    });
    expect(p.conflicts.find((c) => c.sessionId === "aujourdhui")!.reason).toBe("déjà en cours avec « B1 » de 16h à 17h");
    expect(p.toAssign.map((a) => a.sessionId)).toContain("coanimee");
  });

  it("deux séances qui se touchent sans se chevaucher ne sont pas en conflit", () => {
    const p = plan({ busy: [{ id: "x", groupName: "Matin", startsAt: "2026-10-26T10:00:00Z", endsAt: "2026-10-26T13:30:00Z", asCoTrainer: false }], absences: [] });
    expect(p.conflicts).toEqual([]);
  });
});

describe("avertissements (non bloquants)", () => {
  it("plafond hebdo dépassé : heures de formatrice principale, comme le moteur", () => {
    const busy: BusySession[] = [
      { id: "b", groupName: "B1", startsAt: "2026-11-02T08:00:00Z", endsAt: "2026-11-02T10:00:00Z", asCoTrainer: false },
      { id: "c", groupName: "Co", startsAt: "2026-10-27T08:00:00Z", endsAt: "2026-10-27T12:00:00Z", asCoTrainer: true },
    ];
    const p = plan({ busy, absences: [], weeklyHoursMax: 5 });
    expect(p.warnings).toEqual(["Plafond d'heures dépassé la semaine du lundi 2 novembre : 5,3 h pour 5 h prévues sur sa fiche (simple avertissement)."]);
    // Avertissement seulement : les séances sont confiées quand même
    expect(p.toAssign.map((a) => a.sessionId)).toContain("coanimee");
    expect(plan({ busy, absences: [], weeklyHoursMax: 3 }).warnings[0]).toContain("sur 5 semaines");
  });

  it("créneau hors des disponibilités déclarées ; rien si aucune disponibilité saisie", () => {
    const p = plan({ availabilities: [{ weekday: 1, start: "14:00", end: "17:00" }] });
    expect(p.warnings).toEqual(["En dehors de ses disponibilités déclarées : lundi 14h30-17h45 (simple avertissement)."]);
    expect(plan({ availabilities: [] }).warnings).toEqual([]);
    expect(plan({ availabilities: [{ weekday: 1, start: "14:00", end: "18:00" }] }).warnings).toEqual([]);
  });
});

describe("aperçu du dialogue", () => {
  it("résumé : nombres, conflits lisibles, destinataires", () => {
    const preview = summarizePlan(plan(), { trainerFirstName: "Anne", emailTo: ["Anne", "Marie"] });
    expect(preview).toMatchObject({ assign: 2, already: 1, coTrainerRemoved: 1, firstOn: "lundi 26 octobre, 14h30–17h45", lastOn: "lundi 2 novembre, 14h30–17h45" });
    expect(preview.conflicts[0]).toEqual({ sessionId: "conge", when: "lundi 23 novembre, 14h30–17h45", reason: "en congé ce jour-là", keeps: "Marie Dupont" });
    expect(previewHeadline(preview)).toBe("2 séances confiées à Anne, 3 restent à régler :");
  });

  it("phrases de tête selon les cas", () => {
    const base = { trainerFirstName: "Anne", already: 0, conflicts: [] };
    const one = [{ sessionId: "x", when: "w", reason: "r", keeps: null }];
    expect(previewHeadline({ ...base, assign: 12 })).toBe("12 séances à venir seront confiées à Anne.");
    expect(previewHeadline({ ...base, assign: 1 })).toBe("1 séance à venir sera confiée à Anne.");
    expect(previewHeadline({ ...base, assign: 12, conflicts: [...one, ...one] })).toBe("12 séances confiées à Anne, 2 restent à régler :");
    expect(previewHeadline({ ...base, assign: 0, conflicts: one })).toBe("Aucune séance ne peut être confiée à Anne : 1 reste à régler :");
    expect(previewHeadline({ ...base, assign: 0 })).toBe("Aucune séance à venir à partir de cette date : seul le formateur du groupe change.");
    expect(previewHeadline({ ...base, assign: 0, already: 3 })).toContain("déjà à Anne");
  });

  it("libellé d'une séance à l'heure de Paris (été comme hiver)", () => {
    expect(sessionLabel({ startsAt: "2026-10-19T12:30:00Z", endsAt: "2026-10-19T15:45:00Z" })).toBe("lundi 19 octobre, 14h30–17h45");
    expect(sessionLabel({ startsAt: "2026-11-02T08:00:00+00:00", endsAt: "2026-11-02T11:00:00+00:00" })).toBe("lundi 2 novembre, 9h–12h");
  });
});

describe("liste des personnes proposées", () => {
  it("actives seulement, formateur actuel exclu, avec la mention de statut", () => {
    const choices = trainerChoices(
      [
        { id: MARIE, first_name: "Marie", last_name: "Dupont", contract_type: "salarie" },
        { id: ANNE, first_name: "Anne", last_name: "Philippon", contract_type: "benevole" },
        { id: "lea", first_name: "Léa", last_name: null, contract_type: "stagiaire" },
        { id: "sab", first_name: "Sabrina", last_name: "Amri", contract_type: "prestataire" },
        { id: "partie", first_name: "Old", last_name: "Partie", contract_type: "vacataire", is_active: false },
      ],
      MARIE,
    );
    expect(choices).toEqual([
      { id: ANNE, label: "Anne Philippon (bénévole)" },
      { id: "lea", label: "Léa (stagiaire)" },
      { id: "sab", label: "Sabrina Amri" },
    ]);
    // Groupe « Non affecté » : tout le monde est proposé
    expect(trainerChoices([{ id: MARIE, first_name: "Marie", last_name: "Dupont", contract_type: "salarie" }], null)).toHaveLength(1);
  });
});

describe("trace", () => {
  it("« Formateur changé le JJ/MM par Prénom : Ancien → Nouveau, à partir du JJ/MM » (heure de Paris)", () => {
    expect(trainerChangeTrace({ at: NOW, actorName: "Anis Kilani", fromName: null, toName: "Anne Philippon", effectiveFrom: "2026-10-26" }))
      .toBe("Formateur changé le 26/10 par Anis : Non affecté → Anne Philippon, à partir du 26/10");
    expect(trainerChangeTrace({ at: new Date("2026-10-26T23:30:00Z"), actorName: null, fromName: "Marie Dupont", toName: "Anne Philippon", effectiveFrom: "2026-11-02" }))
      .toBe("Formateur changé le 27/10 : Marie Dupont → Anne Philippon, à partir du 02/11");
  });

  it("ajoutée aux notes, la dernière affichée, retirée d'un groupe reconduit", () => {
    const t1 = "Formateur changé le 01/10 par Anis : Non affecté → Marie Dupont, à partir du 01/10";
    const t2 = "Formateur changé le 26/10 par Anis : Marie Dupont → Anne Philippon, à partir du 26/10";
    expect(appendTrace(null, t1)).toBe(t1);
    const notes = appendTrace(appendTrace("Groupe du lundi après-midi.  ", t1), t2);
    expect(notes).toBe(`Groupe du lundi après-midi.\n${t1}\n${t2}`);
    expect(lastTrainerChangeTrace(notes)).toBe(t2);
    expect(lastTrainerChangeTrace("Rien à signaler")).toBeNull();
    expect(withoutTrainerChangeTraces(notes)).toBe("Groupe du lundi après-midi.");
    expect(withoutTrainerChangeTraces(t1)).toBeNull();
  });
});

describe("emails", () => {
  const ctx = {
    groupName: "Atelier alphabétisation — bénévoles",
    effectiveFrom: "2026-10-26",
    pattern: [{ weekday: 1, start: "14:30", end: "17:45" }],
    room: { name: "Salle Debain", address: "12 rue Debain, Saint-Ouen", access_notes: "Interphone « PEF », 2e étage" },
    assigned: [
      { startsAt: "2026-10-26T13:30:00Z", endsAt: "2026-10-26T16:45:00Z" },
      { startsAt: "2026-11-02T13:30:00Z", endsAt: "2026-11-02T16:45:00Z" },
    ],
  };

  it("à la nouvelle personne : groupe, date d'effet, jours et horaires, lieu, séances non confiées, agenda", () => {
    const mail = newTrainerEmail({ ...ctx, firstName: "Anne", notAssigned: [{ startsAt: "2026-11-23T13:30:00Z", endsAt: "2026-11-23T16:45:00Z" }] });
    expect(mail.subject).toBe("Nouveau groupe confié : Atelier alphabétisation — bénévoles, à partir du lundi 26 octobre");
    expect(mail.html).toContain("Bonjour Anne,");
    expect(mail.html).toContain("<strong>Atelier alphabétisation — bénévoles</strong>");
    expect(mail.html).toContain("À partir du lundi 26 octobre 2026");
    expect(mail.html).toContain("Jours et horaires : lundi 14h30-17h45");
    expect(mail.html).toContain("Lieu : Salle Debain — 12 rue Debain, Saint-Ouen<br/><em>Interphone « PEF », 2e étage</em>");
    expect(mail.html).toContain("Première séance : lundi 26 octobre, 14h30–17h45");
    expect(mail.html).toContain("2 séances, jusqu'au lundi 2 novembre");
    expect(mail.html).toContain("<li>lundi 23 novembre, 14h30–17h45</li>");
    expect(mail.html).toContain("agenda « Cours PEF »");
    expect(mail.html).toContain("https://pef-erp.vercel.app/dashboard");
  });

  it("à l'ancienne personne : qui reprend, ce qui sort de son agenda, ce qu'elle garde", () => {
    const mail = previousTrainerEmail({ ...ctx, firstName: "Marie Dupont", newTrainerName: "Anne Philippon", kept: [{ startsAt: "2026-11-23T13:30:00Z", endsAt: "2026-11-23T16:45:00Z" }] });
    expect(mail.subject).toBe("Changement de formateur : Atelier alphabétisation — bénévoles, à partir du lundi 26 octobre");
    expect(mail.html).toContain("Bonjour Marie,");
    expect(mail.html).toContain("est confié à Anne Philippon");
    expect(mail.html).toContain("2 séances à venir sortent de votre planning");
    expect(mail.html).toContain("Les séances passées et leurs feuilles d'émargement ne changent pas.");
    expect(mail.html).toContain("Vous gardez pour l'instant ces séances (Anne n'est pas libre)");
    expect(mail.html).toContain("<li>lundi 23 novembre, 14h30–17h45</li>");
    expect(previousTrainerEmail({ ...ctx, firstName: "Marie", newTrainerName: "Anne", kept: [] }).html).not.toContain("Vous gardez");
  });

  it("sans rythme enregistré : les créneaux des séances ; le HTML est échappé", () => {
    const mail = newTrainerEmail({ ...ctx, pattern: [], groupName: "A1 <test> & co", room: null, firstName: "Anne", notAssigned: [] });
    expect(mail.html).toContain("Jours et horaires : lundi 14h30-17h45");
    expect(mail.html).toContain("A1 &lt;test&gt; &amp; co");
    expect(mail.html).not.toContain("Lieu :");
    expect(mail.html).not.toContain("ne vous sont pas confiées");
  });
});

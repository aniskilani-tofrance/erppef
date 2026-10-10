import { describe, expect, it } from "vitest";
import { hasReminderCue, noteToActionsPrompt, todayIso, NoteActionsSchema, BroadcastSchema } from "@/lib/ai/prompts";
import { freeSeats, matchSeatCandidates, slotsOverlap } from "@/lib/groupes/free-seats";

describe("assistant : pré-filtre des rappels et prompts", () => {
  it("ne déclenche un appel que si la note ressemble à un rappel", () => {
    expect(hasReminderCue("Rappeler jeudi après 17h")).toBe(true);
    expect(hasReminderCue("relancer la semaine prochaine")).toBe(true);
    expect(hasReminderCue("rdv le 14/10")).toBe(true);
    expect(hasReminderCue("Préfère les cours du matin")).toBe(false);
    expect(hasReminderCue(null)).toBe(false);
  });

  it("le prompt note→actions embarque la date du jour, le roster et la note", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const p = noteToActionsPrompt({ note: "Fatima vient jeudi", now, roster: [{ ref: "A-0001", firstName: "Fatima", lastName: "B", status: "convoque" }], trainers: ["Marie"], nextMeeting: null });
    expect(todayIso(now)).toBe("2026-10-10");
    expect(p.user).toContain("2026-10-10");
    expect(p.user).toContain("A-0001 Fatima B [convoque]");
    expect(p.user).toContain("Fatima vient jeudi");
    expect(p.system).not.toMatch(/téléphone :/);
  });

  it("les schémas acceptent une réponse typique et refusent un type inconnu", () => {
    expect(NoteActionsSchema.safeParse({ summary: "ok", actions: [{ type: "rappel", label: "Rappeler Ali", confidence: "haute", learner_ref: "A-0002", trainer_name: null, phone: null, status: null, outcome: null, note: null, starts_on: "2026-10-15", ends_on: null, kind: null, due_time: "17:00", text: "Rappeler Ali" }] }).success).toBe(true);
    expect(NoteActionsSchema.safeParse({ summary: "ok", actions: [{ type: "supprimer_fiche", label: "x", confidence: "haute" }] }).success).toBe(false);
    expect(BroadcastSchema.safeParse({ fr: "Bonjour à tous", translations: [] }).success).toBe(true);
  });
});

describe("places libérées : candidats compatibles", () => {
  const group = { entryLevel: "A1", pattern: [{ weekday: 1, start: "09:00", end: "13:00" }, { weekday: 2, start: "09:00", end: "13:00" }] };
  it("compte les places libres", () => {
    expect(freeSeats(15, 12)).toBe(3);
    expect(freeSeats(15, 15)).toBe(0);
    expect(freeSeats(null, 3)).toBe(0);
  });
  it("retient liste d'attente et évalués au bon niveau, sans chevauchement d'horaires", () => {
    const out = matchSeatCandidates(group, [
      { id: "ok", status: "liste_attente", level: "A1", currentPatterns: [] },
      { id: "evalue", status: "evalue", level: "A1", currentPatterns: [[{ weekday: 4, start: "13:00", end: "17:00" }]] },
      { id: "niveau", status: "liste_attente", level: "B1", currentPatterns: [] },
      { id: "inscrit", status: "inscrit", level: "A1", currentPatterns: [] },
      { id: "chevauche", status: "liste_attente", level: "A1", currentPatterns: [[{ weekday: 2, start: "10:00", end: "12:00" }]] },
    ]);
    expect(out.map((c) => c.id)).toEqual(["ok", "evalue"]);
    expect(slotsOverlap([{ weekday: 1, start: "09:00", end: "12:00" }], [{ weekday: 1, start: "12:00", end: "15:00" }])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { QUESTIONS } from "@/lib/placement/grading";
import { evaluationQuestionIds, evaluationQuestions, normalizeTarget } from "@/lib/evaluations/questions";
import { hasProgressed, levelIndex, nextLevel, suggestLevel, suggestMark, summarizeSkills, gridComplete } from "@/lib/evaluations/grid";
import { computeMilestones, daysUntil, milestoneState, reminderStage } from "@/lib/evaluations/milestones";

describe("évaluations — échelle et grille", () => {
  it("ordonne les niveaux du positionnement au B2 et détecte une progression", () => {
    expect(levelIndex("A1")).toBeLessThan(levelIndex("A2"));
    expect(levelIndex("Post-alpha (A1.1 en cours)")).toBeLessThan(levelIndex("A1.1"));
    expect(levelIndex("A1 (en cours)")).toBe(levelIndex("A1"));
    expect(hasProgressed("A1.1", "A1")).toBe(true);
    expect(hasProgressed("A2", "A2")).toBe(false);
    expect(hasProgressed(null, "A1")).toBe(false);
    expect(nextLevel("A1")).toBe("A2");
    expect(nextLevel("B2")).toBeNull();
  });

  it("propose un niveau et un cran d'après le score d'un test ciblé", () => {
    expect(suggestLevel(80, "A1")).toBe("A2");
    expect(suggestLevel(50, "A1")).toBe("A1");
    expect(suggestLevel(30, "A1")).toBe("A1 (en cours)");
    expect(suggestMark(80)).toBe("acquis");
    expect(suggestMark(50)).toBe("en_cours");
    expect(suggestMark(10)).toBe("non_acquis");
  });

  it("résume les crans par compétence et sait si une grille est complète", () => {
    const summary = summarizeSkills([
      { co: "acquis", po: "en_cours", ce: "acquis", pe: null },
      { co: "acquis", po: "non_acquis", ce: "en_cours", pe: "acquis" },
    ]);
    expect(summary.find((s) => s.code === "co")).toMatchObject({ acquis: 2, total: 2 });
    expect(summary.find((s) => s.code === "pe")).toMatchObject({ acquis: 1, total: 1 });
    expect(gridComplete({ co: "acquis", po: "acquis", ce: "acquis", pe: "acquis" })).toBe(true);
    expect(gridComplete({ co: "acquis", po: null, ce: "acquis", pe: "acquis" })).toBe(false);
  });
});

describe("évaluations — test ciblé", () => {
  it("prend une vingtaine de questions au niveau visé et au niveau suivant, sans réponses", () => {
    const ids = evaluationQuestionIds("A1");
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(ids.length).toBeLessThanOrEqual(20);
    const levels = new Set(ids.map((id) => QUESTIONS.find((q: { id: number }) => q.id === id)?.level));
    expect([...levels].sort()).toEqual(["A1", "A2"]);
    const qs = evaluationQuestions("A1");
    expect(qs.every((q: { correct?: unknown; acceptedAnswers?: unknown }) => q.correct === undefined && q.acceptedAnswers === undefined)).toBe(true);
    expect(evaluationQuestionIds("A1")).toEqual(ids); // stable
  });

  it("normalise le niveau visé (A1.1 → A1, inconnu → A1) et couvre B1 → B2", () => {
    expect(normalizeTarget("A1.1")).toBe("A1");
    expect(normalizeTarget(null)).toBe("A1");
    expect(normalizeTarget("b1")).toBe("B1");
    const b2 = evaluationQuestionIds("B2");
    expect(b2.every((id) => QUESTIONS.find((q: { id: number }) => q.id === id)?.level === "B2")).toBe(true);
  });
});

describe("évaluations — jalons", () => {
  const sessions = [
    { starts_at: "2026-10-05T07:00:00Z", ends_at: "2026-10-05T11:00:00Z", status: "planifiee" },
    { starts_at: "2026-10-12T07:00:00Z", ends_at: "2026-10-12T11:00:00Z", status: "planifiee" },
    { starts_at: "2026-10-19T07:00:00Z", ends_at: "2026-10-19T11:00:00Z", status: "annulee" },
    { starts_at: "2026-10-26T07:00:00Z", ends_at: "2026-10-26T11:00:00Z", status: "planifiee" },
    { starts_at: "2026-11-02T07:00:00Z", ends_at: "2026-11-02T11:00:00Z", status: "planifiee" },
  ];

  it("mi-parcours à la moitié des heures (hors annulées), finale à la dernière séance, remplaçables", () => {
    const m = computeMilestones(sessions);
    expect(m.midterm).toEqual({ kind: "mi_parcours", on: "2026-10-12", auto: true });
    expect(m.final).toEqual({ kind: "finale", on: "2026-11-02", auto: true });
    expect(computeMilestones(sessions, { midterm_on: "2026-10-20" }).midterm).toEqual({ kind: "mi_parcours", on: "2026-10-20", auto: false });
    expect(computeMilestones([]).final.on).toBeNull();
  });

  it("état du jalon et palier de rappel selon la date du jour", () => {
    expect(daysUntil("2026-10-12", "2026-10-05")).toBe(7);
    expect(milestoneState("2026-10-12", "2026-09-20", 0, 10)).toBe("a_venir");
    expect(milestoneState("2026-10-12", "2026-10-08", 0, 10)).toBe("bientot");
    expect(milestoneState("2026-10-12", "2026-10-15", 0, 10)).toBe("a_faire");
    expect(milestoneState("2026-10-12", "2026-10-15", 3, 10)).toBe("en_cours");
    expect(milestoneState("2026-10-12", "2026-10-15", 10, 10)).toBe("faite");
    expect(milestoneState(null, "2026-10-15", 0, 10)).toBe("sans_date");
    expect(reminderStage("2026-10-12", "2026-10-05")).toBe("j7");
    expect(reminderStage("2026-10-12", "2026-10-11")).toBe("j1");
    expect(reminderStage("2026-10-12", "2026-10-12")).toBe("j1");
    expect(reminderStage("2026-10-12", "2026-09-20")).toBeNull();
    expect(reminderStage("2026-10-12", "2026-10-13")).toBeNull();
  });
});

describe("évaluations — section « Acquis » du bilan financeur", () => {
  it("compte les grilles finales, les niveaux atteints et la progression depuis l'entrée", async () => {
    const { computeAcquis } = await import("@/lib/reports/funder-report");
    const learners = [
      { id: "l1", firstName: "A", lastName: "A", gender: null, birthDate: null, city: null, district: null, qpv: null, activityStatus: null, rqth: null, educationLevel: null, levelAssessed: "A1.1" },
      { id: "l2", firstName: "B", lastName: "B", gender: null, birthDate: null, city: null, district: null, qpv: null, activityStatus: null, rqth: null, educationLevel: null, levelAssessed: "A1" },
      { id: "l3", firstName: "C", lastName: "C", gender: null, birthDate: null, city: null, district: null, qpv: null, activityStatus: null, rqth: null, educationLevel: null, levelAssessed: null },
    ];
    const acquis = computeAcquis(
      [
        { learnerId: "l1", groupId: "g", kind: "finale", co: "acquis", po: "acquis", ce: "en_cours", pe: "non_acquis", levelReached: "A1" },
        { learnerId: "l2", groupId: "g", kind: "finale", co: "acquis", po: "en_cours", ce: "acquis", pe: "acquis", levelReached: "A1" },
        { learnerId: "l3", groupId: "g", kind: "finale", co: null, po: null, ce: null, pe: null, levelReached: "A2" },
        { learnerId: "l1", groupId: "g", kind: "mi_parcours", co: "en_cours", po: "en_cours", ce: "non_acquis", pe: "non_acquis", levelReached: null },
        { learnerId: "autre", groupId: "g", kind: "finale", co: "acquis", po: "acquis", ce: "acquis", pe: "acquis", levelReached: "B1" },
      ],
      learners,
    );
    expect(acquis?.evaluated).toBe(3);
    expect(acquis?.skills.find((s) => s.code === "co")).toMatchObject({ acquis: 2, total: 2 });
    expect(acquis?.levels).toEqual([{ label: "A1", count: 2 }, { label: "A2", count: 1 }]);
    expect(acquis?.compared).toBe(2); // l3 sans niveau d'entrée
    expect(acquis?.progressed).toBe(1); // l1 : A1.1 → A1 ; l2 : A1 → A1
    expect(computeAcquis([], learners)).toBeNull();
  });
});

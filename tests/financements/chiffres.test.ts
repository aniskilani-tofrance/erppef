import { describe, expect, it } from "vitest";
import { figurePeriods, figuresLines, figuresText, mergeReportData, periodByKey } from "@/lib/financements/chiffres";
import { UNKNOWN_LABEL, type FunderReport, type FunderReportData } from "@/lib/reports/funder-report";

function report(over: Partial<FunderReport["totals"]> = {}, acquis: FunderReport["acquis"] = null): FunderReport {
  return {
    funderName: "Toute l'association",
    from: "2026-01-01",
    to: "2026-12-31",
    totals: {
      groupCount: 5, sessionsDone: 120, hoursDone: 360, hoursPlanned: 40, uniqueLearners: 46, exits: { abandon: 3, termine: 12 },
      averageAttendanceRate: 82, absences: 50, excusedAbsences: 10, ...over,
    },
    distributions: {
      gender: [{ label: "Femmes", count: 32 }, { label: "Hommes", count: 14 }],
      age: [{ label: "26-44 ans", count: 30 }, { label: "45 ans et plus", count: 12 }, { label: UNKNOWN_LABEL, count: 4 }],
      activity: [],
      qpv: [{ label: "En QPV", count: 21 }, { label: "Hors QPV", count: 25 }],
      rqth: [{ label: "RQTH", count: 2 }, { label: "Sans RQTH", count: 44 }],
      education: [],
      cities: [
        { label: "Saint-Ouen", count: 30 }, { label: "Saint-Denis", count: 6 }, { label: "Paris", count: 4 }, { label: "Clichy", count: 2 },
        { label: "Aubervilliers", count: 2 }, { label: "Épinay", count: 1 }, { label: "Stains", count: 1 },
      ],
      districts: [],
      sources: [{ label: "Maison de quartier", count: 20 }],
    },
    groupDetails: [],
    learnerDetails: [{ learnerId: "l1", name: "NOM Prénom", ref: "A-0001", groups: [], hoursAttended: 10, rate: 90, absences: 0, excusedAbsences: 0, hoursExcused: 0 }],
    acquis,
  };
}

describe("Chiffres de l'ERP pour un dossier", () => {
  it("périodes proposées : année de formation d'abord, puis année civile", () => {
    const nov = figurePeriods("2026-11-18");
    expect(nov.map((p) => p.key)).toEqual(["formation", "annee", "formation_precedente", "annee_precedente"]);
    expect(nov[0]).toMatchObject({ label: "Année de formation 2026-2027", from: "2026-09-01", to: "2027-08-31" });
    expect(nov[1]).toMatchObject({ label: "Année civile 2026", from: "2026-01-01", to: "2026-12-31" });
    // Avant septembre, l'année de formation en cours a commencé l'année d'avant.
    expect(figurePeriods("2027-03-02")[0]).toMatchObject({ from: "2026-09-01", to: "2027-08-31" });
    expect(periodByKey("annee", "2026-11-18").from).toBe("2026-01-01");
    expect(periodByKey("inconnue", "2026-11-18").key).toBe("formation");
  });

  it("des totaux seulement : ni nom, ni référence d'apprenant, ni RQTH", () => {
    const lines = figuresLines(report());
    const text = lines.join("\n");
    expect(lines[0]).toBe("46 personnes accompagnées, dans 5 groupes");
    expect(text).toContain("360 heures de formation réalisées (120 séances)");
    expect(text).toContain("Taux de présence moyen : 82 %");
    expect(text).toContain("Sexe : Femmes 32, Hommes 14");
    expect(text).toContain("Âge : 26-44 ans 30, 45 ans et plus 12, non renseigné 4");
    expect(text).toContain("Communes : Saint-Ouen 30, Saint-Denis 6, Paris 4, Clichy 2, Aubervilliers 2, autres 2");
    expect(text).not.toMatch(/RQTH/i);
    expect(text).not.toContain("NOM Prénom");
    expect(text).not.toContain("A-0001");
    // Une répartition vide n'apparaît pas.
    expect(text).not.toContain("Situation :");
  });

  it("les acquis de fin de parcours s'ajoutent quand ils existent", () => {
    const lines = figuresLines(report({}, { evaluated: 10, skills: [], levels: [{ label: "A2", count: 6 }, { label: "A1", count: 4 }], compared: 8, progressed: 5 }));
    expect(lines.join("\n")).toContain("Niveau atteint en fin de parcours (10 personnes évaluées) : A2 6, A1 4");
    expect(lines.join("\n")).toContain("Progression : 5 sur 8 ont gagné au moins un niveau");
  });

  it("aucune activité : pas de texte à insérer", () => {
    const empty = report({ groupCount: 0, sessionsDone: 0, hoursDone: 0, hoursPlanned: 0, uniqueLearners: 0, exits: { abandon: 0, termine: 0 }, averageAttendanceRate: null });
    expect(figuresLines(empty)).toEqual([]);
    expect(figuresText(empty, "Année civile 2026")).toBe("");
    expect(figuresText(report(), "Année civile 2026").split("\n")[0]).toBe("Chiffres de l'ERP — Année civile 2026 :");
  });

  it("une personne inscrite chez deux financeurs n'est comptée qu'une fois", () => {
    const learner = (id: string) => ({ id }) as unknown as FunderReportData["learners"][number];
    const part = (learners: string[], groupId: string): FunderReportData => ({
      funderName: "X", from: "2026-01-01", to: "2026-12-31",
      groups: [{ id: groupId, name: groupId, programName: null, startsOn: "2026-01-01", endsOn: null }],
      sessions: [], enrollments: learners.map((l) => ({ learnerId: l, groupId, status: "inscrit" })),
      learners: learners.map(learner), attendanceRecords: [],
    });
    const merged = mergeReportData([part(["l1", "l2"], "g1"), part(["l2", "l3"], "g2")], "Toute l'association", "2026-01-01", "2026-12-31");
    expect(merged.learners.map((l) => l.id).sort()).toEqual(["l1", "l2", "l3"]);
    expect(merged.groups).toHaveLength(2);
    expect(merged.enrollments).toHaveLength(4);
    expect(merged.funderName).toBe("Toute l'association");
    expect(mergeReportData([], "Vide", "2026-01-01", "2026-12-31").learners).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  ageBucket,
  computeFunderReport,
  UNKNOWN_LABEL,
  type FunderReportData,
  type ReportLearner,
} from "@/lib/reports/funder-report";

function learner(id: string, overrides: Partial<ReportLearner> = {}): ReportLearner {
  return {
    id,
    firstName: id,
    lastName: "Test",
    gender: null,
    birthDate: null,
    city: null,
    district: null,
    qpv: null,
    activityStatus: null,
    rqth: null,
    educationLevel: null,
    ...overrides,
  };
}

function baseData(overrides: Partial<FunderReportData> = {}): FunderReportData {
  return {
    funderName: "Ville",
    from: "2026-01-01",
    to: "2026-12-31",
    groups: [
      { id: "g1", name: "PEF A1", programName: "PEF A1", startsOn: "2026-01-05", endsOn: "2026-06-30" },
    ],
    sessions: [
      // deux séances passées de 3 h (réalisées), une annulée, une future planifiée
      { groupId: "g1", startsAt: "2026-01-05T08:00:00Z", endsAt: "2026-01-05T11:00:00Z", status: "realisee", closed: true },
      { groupId: "g1", startsAt: "2026-01-06T08:00:00Z", endsAt: "2026-01-06T11:00:00Z", status: "realisee", closed: true },
      { groupId: "g1", startsAt: "2026-01-07T08:00:00Z", endsAt: "2026-01-07T11:00:00Z", status: "annulee", closed: false },
      { groupId: "g1", startsAt: "2099-01-05T08:00:00Z", endsAt: "2099-01-05T11:00:00Z", status: "planifiee", closed: false },
    ],
    enrollments: [
      { learnerId: "a", groupId: "g1", status: "inscrit" },
      { learnerId: "b", groupId: "g1", status: "abandon" },
    ],
    learners: [
      learner("a", { gender: "femme", birthDate: "2000-06-15", city: "Saint-Ouen", qpv: true, activityStatus: "rsa" }),
      learner("b"),
    ],
    attendanceRecords: [
      { learnerId: "a", status: "present", startsAt: "2026-01-05T08:00:00Z", hours: 3 },
      { learnerId: "a", status: "absent", startsAt: "2026-01-06T08:00:00Z", hours: 3 },
      { learnerId: "b", status: "present", startsAt: "2026-01-05T08:00:00Z", hours: 3 },
    ],
    ...overrides,
  };
}

describe("ageBucket", () => {
  it("calcule l'âge au dernier jour de la période", () => {
    expect(ageBucket("2000-06-15", "2026-12-31")).toBe("26-44 ans");
    expect(ageBucket("2001-01-01", "2026-12-31")).toBe("18-25 ans"); // 25 ans révolus
    expect(ageBucket("2009-06-15", "2026-12-31")).toBe("Moins de 18 ans");
    expect(ageBucket("1980-12-31", "2026-12-31")).toBe("45 ans et plus"); // anniversaire le jour même
    expect(ageBucket(null, "2026-12-31")).toBe(UNKNOWN_LABEL);
  });
});

describe("computeFunderReport", () => {
  it("compte heures réalisées (hors annulées), bénéficiaires et sorties", () => {
    const report = computeFunderReport(baseData());
    expect(report.totals.groupCount).toBe(1);
    expect(report.totals.sessionsDone).toBe(2);
    expect(report.totals.hoursDone).toBe(6); // 2 × 3 h, l'annulée ne compte pas
    expect(report.totals.hoursPlanned).toBe(3); // la séance future
    expect(report.totals.uniqueLearners).toBe(2); // l'abandon reste un bénéficiaire
    expect(report.totals.exits.abandon).toBe(1);
    expect(report.totals.exits.termine).toBe(0);
  });

  it("calcule l'assiduité moyenne sur les émargements", () => {
    const report = computeFunderReport(baseData());
    // a : 1/2 = 50 %, b : 1/1 = 100 % → moyenne 75 %
    expect(report.totals.averageAttendanceRate).toBe(75);
  });

  it("répartit la typologie avec un compteur « Non renseigné »", () => {
    const report = computeFunderReport(baseData());
    expect(report.distributions.gender).toEqual([
      { label: "Femmes", count: 1 },
      { label: UNKNOWN_LABEL, count: 1 },
    ]);
    expect(report.distributions.qpv).toEqual([
      { label: "Résidents QPV", count: 1 },
      { label: UNKNOWN_LABEL, count: 1 },
    ]);
    const age = report.distributions.age;
    expect(age.find((d) => d.label === "26-44 ans")?.count).toBe(1);
    expect(age.find((d) => d.label === UNKNOWN_LABEL)?.count).toBe(1);
  });

  it("compte un apprenant multi-groupes UNE seule fois dans les bénéficiaires", () => {
    const data = baseData({
      groups: [
        { id: "g1", name: "PEF A1", programName: null, startsOn: "2026-01-05", endsOn: null },
        { id: "g2", name: "PEF A2", programName: null, startsOn: "2026-03-01", endsOn: null },
      ],
      enrollments: [
        { learnerId: "a", groupId: "g1", status: "inscrit" },
        { learnerId: "a", groupId: "g2", status: "inscrit" },
      ],
      learners: [learner("a")],
    });
    const report = computeFunderReport(data);
    expect(report.totals.uniqueLearners).toBe(1);
    expect(report.learnerDetails).toHaveLength(1);
    expect(report.learnerDetails[0].groups).toEqual(["PEF A1", "PEF A2"]);
  });

  it("détaille chaque groupe (heures, effectif, assiduité)", () => {
    const report = computeFunderReport(baseData());
    expect(report.groupDetails).toHaveLength(1);
    const g = report.groupDetails[0];
    expect(g.learnerCount).toBe(2);
    expect(g.sessionsDone).toBe(2);
    expect(g.hoursDone).toBe(6);
    expect(g.attendanceRate).toBe(75);
  });

  it("reste cohérent sans aucune donnée", () => {
    const report = computeFunderReport(
      baseData({ groups: [], sessions: [], enrollments: [], learners: [], attendanceRecords: [] }),
    );
    expect(report.totals.groupCount).toBe(0);
    expect(report.totals.hoursDone).toBe(0);
    expect(report.totals.uniqueLearners).toBe(0);
    expect(report.totals.averageAttendanceRate).toBeNull();
    expect(report.distributions.gender).toEqual([]);
  });
});

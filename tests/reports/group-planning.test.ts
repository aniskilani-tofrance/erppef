import { describe, expect, it } from "vitest";
import { buildPlanningCsv, buildPlanningIcs, describeHolidays, describePattern, planningFileName, type GroupPlanning } from "@/lib/reports/group-planning";

const planning: GroupPlanning = {
  groupId: "g1", groupNo: 4, name: "PEF A1 — 2026-27", programName: "PEF A1", funderName: "ParlerEmploi Formation",
  trainerName: "Marie TREGARO", roomName: "Salle 12", roomAddress: "1 place Martin Levasseur, Saint-Ouen",
  startsOn: "2026-10-05", endsOn: "2027-06-08", totalHours: 300,
  weeklyPattern: [{ weekday: 2, start: "13:00", end: "16:00" }, { weekday: 1, start: "09:00", end: "12:00" }, { weekday: 2, start: "09:00", end: "12:00" }],
  skipSchoolHolidays: false, notes: null, holidays: [],
  sessions: [
    { id: "s1", startsAt: "2026-10-05T07:00:00Z", endsAt: "2026-10-05T10:00:00Z", status: "planifiee", roomName: "Salle 12", trainerName: "Marie TREGARO" },
    { id: "s2", startsAt: "2026-10-06T07:00:00Z", endsAt: "2026-10-06T10:00:00Z", status: "annulee", roomName: "Salle 12", trainerName: "Marie TREGARO" },
    { id: "s3", startsAt: "2026-12-01T13:00:00Z", endsAt: "2026-12-01T16:00:00Z", status: "planifiee", roomName: null, trainerName: null },
  ],
};

describe("planning de groupe à diffuser", () => {
  it("décrit le rythme hebdo dans l'ordre des jours, en français", () => {
    expect(describePattern(planning.weeklyPattern)).toBe("lundi 9h-12h · mardi 9h-12h · mardi 13h-16h");
    expect(describePattern([{ weekday: 6, start: "09:00", end: "12:00" }, { weekday: 2, start: "18:00", end: "20:00" }], ", ")).toBe("mardi 18h-20h, samedi 9h-12h");
  });

  it("CSV : BOM, séparateur ;, heures de Paris, cumul hors séances annulées", () => {
    const csv = buildPlanningCsv(planning);
    expect(csv.startsWith("\uFEFFDate;Jour;")).toBe(true);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe("05/10/2026;lundi;09h00;12h00;3;Salle 12;Marie TREGARO;Planifiée;3");
    expect(rows[2]).toContain(";Annulée;3");
    // 1er décembre : heure d'hiver → 14h-17h Paris, salle/formatrice du groupe par défaut
    expect(rows[3]).toBe("01/12/2026;mardi;14h00;17h00;3;Salle 12;Marie TREGARO;Planifiée;6");
  });

  it(".ics : un événement par séance non annulée, UID stable, lieu avec adresse", () => {
    const ics = buildPlanningIcs(planning);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain("UID:s1@pef-erp");
    expect(ics).toContain("DTSTART:20261005T070000Z");
    expect(ics).toContain("LOCATION:Salle 12\\, 1 place Martin Levasseur\\, Saint-Ouen");
    expect(ics).not.toContain("s2@pef-erp");
  });

  it("décrit les vacances d'après les séances réelles : travaillées, sans cours, ou mixte", () => {
    const holidays = [
      { label: "Toussaint 2026", startsOn: "2026-10-17", endsOn: "2026-11-01" },
      { label: "Noël 2026", startsOn: "2026-12-19", endsOn: "2027-01-03" },
    ];
    const base = { ...planning, holidays, sessions: [] as GroupPlanning["sessions"] };
    expect(describeHolidays(base)).toBe("Pas de cours pendant les vacances scolaires : Toussaint 2026 (du 17 oct. au 1 nov.), Noël 2026 (du 19 déc. au 3 janv.).");
    const toussaint = { id: "t", startsAt: "2026-10-20T07:00:00Z", endsAt: "2026-10-20T10:00:00Z", status: "planifiee" as const, roomName: null, trainerName: null };
    expect(describeHolidays({ ...base, sessions: [toussaint] })).toBe("Pas de cours pendant Noël 2026 (du 19 déc. au 3 janv.). Les cours continuent pendant les autres vacances (Toussaint 2026).");
    const noel = { ...toussaint, id: "n", startsAt: "2026-12-22T07:00:00Z", endsAt: "2026-12-22T10:00:00Z" };
    expect(describeHolidays({ ...base, sessions: [toussaint, noel] })).toBe("Les cours ont lieu aussi pendant les vacances scolaires (Toussaint 2026, Noël 2026).");
  });

  it("nom de fichier lisible, sans accents", () => {
    expect(planningFileName(planning, "financeur", "pdf")).toBe("planning_PEF-A1-2026-27_financeur.pdf");
    expect(planningFileName(planning, "apprenants", "ics")).toBe("planning_PEF-A1-2026-27_apprenants.ics");
  });
});

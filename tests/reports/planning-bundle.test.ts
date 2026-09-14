import { describe, expect, it } from "vitest";
import type { GroupPlanning } from "@/lib/reports/group-planning";
import { buildBundleCsv, buildBundleIcs, bundleFileName, summarizePlanning } from "@/lib/reports/planning-bundle";

const a1: GroupPlanning = {
  groupId: "g1", groupNo: 4, name: "Cours municipaux A1 — Cordon", programName: "Cours municipaux A1", funderName: "Ville de Saint-Ouen (via BOP104)",
  trainerName: "Marie TREGARO", roomName: "Cordon", roomAddress: "12 rue du Docteur Bauer, Saint-Ouen", roomAccess: null,
  startsOn: "2026-10-05", endsOn: "2027-06-08", totalHours: 300,
  weeklyPattern: [{ weekday: 1, start: "09:00", end: "13:00" }, { weekday: 3, start: "09:00", end: "13:00" }],
  skipSchoolHolidays: true, notes: null, holidays: [],
  sessions: [
    { id: "s1", startsAt: "2026-10-05T07:00:00Z", endsAt: "2026-10-05T11:00:00Z", status: "planifiee", roomName: "Cordon", trainerName: "Marie TREGARO" },
    { id: "s2", startsAt: "2026-10-07T07:00:00Z", endsAt: "2026-10-07T11:00:00Z", status: "annulee", roomName: "Cordon", trainerName: "Marie TREGARO" },
  ],
};
const a2: GroupPlanning = {
  ...a1, groupId: "g2", groupNo: 5, name: "Cours municipaux A2 — Landy", programName: "Cours municipaux A2", roomName: "Landy", roomAddress: null,
  weeklyPattern: [{ weekday: 2, start: "13:00", end: "17:00" }],
  sessions: [{ id: "s3", startsAt: "2026-10-06T11:00:00Z", endsAt: "2026-10-06T15:00:00Z", status: "planifiee", roomName: null, trainerName: null }],
};

describe("plannings groupés (financeur, apprenant, accueil)", () => {
  it("résume chaque groupe pour la page de garde : rythme ligne par ligne, heures hors annulées", () => {
    const s = summarizePlanning(a1);
    expect(s.ref).toBe("G-0004");
    expect(s.pattern).toEqual(["lundi 9h-13h", "mercredi 9h-13h"]);
    expect(s.period).toBe("05/10/2026 → 08/06/2027");
    expect(s.hours).toBe(4);
    expect(s.sessions).toBe(1);
    expect(summarizePlanning({ ...a2, weeklyPattern: [], trainerName: null, roomName: null })).toMatchObject({ pattern: ["—"], trainer: "—", room: "—" });
  });

  it("CSV : colonne Groupe en tête, cumul remis à zéro par groupe, séance sans salle → salle du groupe", () => {
    const rows = buildBundleCsv([a1, a2]).split("\r\n");
    expect(rows[0]).toBe("﻿Groupe;Dispositif;Date;Jour;Début;Fin;Durée (h);Salle;Formatrice;Statut;Cumul groupe (h)");
    expect(rows[1]).toBe("Cours municipaux A1 — Cordon;Cours municipaux A1;05/10/2026;lundi;09h00;13h00;4;Cordon;Marie TREGARO;Planifiée;4");
    expect(rows[2]).toContain(";Annulée;4");
    expect(rows[3]).toBe("Cours municipaux A2 — Landy;Cours municipaux A2;06/10/2026;mardi;13h00;17h00;4;Landy;Marie TREGARO;Planifiée;4");
    expect(rows).toHaveLength(4);
  });

  it(".ics : un seul calendrier avec les séances non annulées de tous les groupes", () => {
    const ics = buildBundleIcs([a1, a2], "Cours Ville de Saint-Ouen");
    expect((ics.match(/BEGIN:VCALENDAR/g) ?? []).length).toBe(1);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain("X-WR-CALNAME:Cours Ville de Saint-Ouen");
    expect(ics).toContain("UID:s1@pef-erp");
    expect(ics).toContain("UID:s3@pef-erp");
    expect(ics).not.toContain("s2@pef-erp");
  });

  it("nomme le fichier d'après le financeur ou l'apprenant, sans accents", () => {
    expect(bundleFileName({ title: "Plannings", subtitle: "Ville de Saint-Ouen (via BOP104)", audience: "financeur" }, "pdf")).toBe("plannings_Ville-de-Saint-Ouen-via-BOP104_financeur.pdf");
    expect(bundleFileName({ title: "Vos plannings de cours", subtitle: "Aïcha Benali", audience: "apprenants" }, "ics")).toBe("plannings_Aicha-Benali_apprenants.ics");
    expect(bundleFileName({ title: "Plannings des cours", subtitle: null, audience: "apprenants" }, "pdf")).toBe("plannings_Plannings-des-cours_apprenants.pdf");
  });
});

import { describe, expect, it } from "vitest";
import { computeLearnerStats, globalAttendance, type AttendanceRecord } from "@/lib/attendance-stats";

const rec = (learnerId: string, status: AttendanceRecord["status"], day: number): AttendanceRecord => ({
  learnerId,
  status,
  startsAt: `2026-09-${String(day).padStart(2, "0")}T07:00:00.000Z`,
  hours: 3,
});

describe("computeLearnerStats", () => {
  it("calcule taux, retards, heures suivies et absences consécutives", () => {
    const stats = computeLearnerStats([
      rec("a", "present", 1),
      rec("a", "retard", 2),
      rec("a", "absent", 3),
      rec("a", "absent", 4),
      rec("a", "absent", 5),
    ]);
    const a = stats.get("a")!;
    expect(a.total).toBe(5);
    expect(a.attended).toBe(2);
    expect(a.late).toBe(1);
    expect(a.absent).toBe(3);
    expect(a.rate).toBe(40);
    expect(a.hoursAttended).toBe(6); // 2 séances suivies × 3 h
    expect(a.consecutiveAbsences).toBe(3); // alerte décrochage
  });

  it("la série d'absences est interrompue par une présence, même en désordre d'entrée", () => {
    const stats = computeLearnerStats([
      rec("b", "absent", 5),
      rec("b", "present", 6), // dernière séance : présent
      rec("b", "absent", 4),
    ]);
    expect(stats.get("b")!.consecutiveAbsences).toBe(0);
  });

  it("absence excusée : comptée comme absence (taux, heures non réalisées), montrée à part", () => {
    const a = computeLearnerStats([
      rec("a", "present", 1),
      rec("a", "excuse", 2),
      rec("a", "absent", 3),
      rec("a", "retard", 4),
    ]).get("a")!;
    expect(a.total).toBe(4);
    expect(a.attended).toBe(2);
    expect(a.absent).toBe(2); // absent + excusé
    expect(a.excused).toBe(1); // dont 1 absence justifiée
    expect(a.rate).toBe(50);
    expect(a.hoursAttended).toBe(6); // l'excusé ne compte pas en heures suivies
    expect(a.hoursExcused).toBe(3);
  });

  it("absence excusée : n'allonge pas la série et ne l'interrompt pas", () => {
    const stats = computeLearnerStats([
      rec("c", "present", 1),
      rec("c", "absent", 2),
      rec("c", "excuse", 3),
      rec("c", "absent", 4),
      rec("d", "present", 1),
      rec("d", "excuse", 2),
      rec("d", "excuse", 3),
      rec("d", "excuse", 4),
    ]);
    expect(stats.get("c")!.consecutiveAbsences).toBe(2);
    expect(stats.get("d")!.consecutiveAbsences).toBe(0); // 3 excusés : pas d'alerte « 3 absences de suite »
  });

  it("taux pour les alertes : hors absences justifiées", () => {
    const d = computeLearnerStats([
      rec("d", "present", 1),
      rec("d", "excuse", 2),
      rec("d", "excuse", 3),
      rec("d", "present", 4),
    ]).get("d")!;
    expect(d.rate).toBe(50); // taux officiel : l'excusé est une absence
    expect(d.unexcusedTotal).toBe(2);
    expect(d.unexcusedRate).toBe(100); // pas de décrochage
    const e = computeLearnerStats([rec("e", "excuse", 1)]).get("e")!;
    expect(e.unexcusedRate).toBeNull();
  });

  it("taux global : excusés = absences, comptés à part", () => {
    expect(globalAttendance([{ status: "present" }, { status: "retard" }, { status: "absent" }, { status: "excuse" }])).toEqual({
      total: 4, attended: 2, excused: 1, rate: 50,
    });
    expect(globalAttendance([]).rate).toBeNull();
  });
});

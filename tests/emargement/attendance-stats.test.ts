import { describe, expect, it } from "vitest";
import { computeLearnerStats, type AttendanceRecord } from "@/lib/attendance-stats";

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
});

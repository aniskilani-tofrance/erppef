import { describe, expect, it } from "vitest";
import { buildAbsenceFollowupMessage, computeAbsenceFollowups, type FollowupAttendance } from "@/lib/absences/followup";

const NOW = new Date("2026-10-08T08:00:00Z");
const learners = [
  { id: "fatima", firstName: "Fatima", lastName: "B.", phone: "06 12 34 56 78" },
  { id: "omar", firstName: "Omar", lastName: "K.", phone: null },
];
const mark = (learnerId: string, startsAt: string, status: FollowupAttendance["status"], groupId = "g1"): FollowupAttendance => ({
  learnerId, sessionId: `${learnerId}-${startsAt}`, groupId, groupName: "Cours municipaux A1", startsAt, status,
});

describe("computeAbsenceFollowups", () => {
  it("liste l'absent à sa dernière séance, avec la série et le prochain cours", () => {
    const res = computeAbsenceFollowups({
      attendances: [
        mark("fatima", "2026-10-01T07:00:00Z", "present"),
        mark("fatima", "2026-10-05T07:00:00Z", "absent"),
        mark("fatima", "2026-10-07T07:00:00Z", "absent"),
      ],
      learners,
      contacts: [],
      nextSessions: [
        { groupId: "g1", startsAt: "2026-10-12T07:00:00Z", roomName: "Salle 13" },
        { groupId: "g1", startsAt: "2026-10-09T07:00:00Z", roomName: "Salle 12" },
        { groupId: "g2", startsAt: "2026-10-08T12:00:00Z", roomName: null },
      ],
      now: NOW,
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ learnerId: "fatima", streak: 2, missedAt: "2026-10-07T07:00:00Z" });
    expect(res[0].nextSession).toEqual({ startsAt: "2026-10-09T07:00:00Z", roomName: "Salle 12" });
  });

  it("ignore qui est revenu en cours, ou a déjà été contacté depuis l'absence", () => {
    const res = computeAbsenceFollowups({
      attendances: [
        mark("fatima", "2026-10-05T07:00:00Z", "absent"),
        mark("fatima", "2026-10-07T07:00:00Z", "retard"),
        mark("omar", "2026-10-07T07:00:00Z", "absent"),
      ],
      learners,
      contacts: [{ learnerId: "omar", contactedAt: "2026-10-07T15:00:00Z" }],
      nextSessions: [],
      now: NOW,
    });
    expect(res).toEqual([]);
  });

  it("un contact ANTÉRIEUR à l'absence ne compte pas ; une absence de plus de 14 jours sort de la liste", () => {
    const res = computeAbsenceFollowups({
      attendances: [
        mark("omar", "2026-10-07T07:00:00Z", "absent"),
        mark("fatima", "2026-09-20T07:00:00Z", "absent"),
      ],
      learners,
      contacts: [{ learnerId: "omar", contactedAt: "2026-10-06T10:00:00Z" }],
      nextSessions: [],
      now: NOW,
    });
    expect(res.map((r) => r.learnerId)).toEqual(["omar"]);
    expect(res[0].nextSession).toBeNull();
  });

  it("met les séries d'absences en tête", () => {
    const res = computeAbsenceFollowups({
      attendances: [
        mark("omar", "2026-10-07T07:00:00Z", "absent"),
        mark("fatima", "2026-10-02T07:00:00Z", "absent"),
        mark("fatima", "2026-10-05T07:00:00Z", "absent"),
      ],
      learners,
      contacts: [],
      nextSessions: [],
      now: NOW,
    });
    expect(res.map((r) => r.learnerId)).toEqual(["fatima", "omar"]);
  });
});

describe("buildAbsenceFollowupMessage", () => {
  it("nomme le cours manqué, l'expéditrice et le prochain cours", () => {
    const text = buildAbsenceFollowupMessage({
      firstName: "Fatima",
      senderFirstName: "Marie",
      missedAt: "2026-10-07T07:00:00Z",
      streak: 1,
      nextSession: { startsAt: "2026-10-09T07:00:00Z", roomName: "Salle 12" },
    });
    expect(text).toContain("Bonjour Fatima,");
    expect(text).toContain("C'est Marie, de ParlerEmploi Formation.");
    expect(text).toContain("au cours de français du mercredi 7 octobre");
    expect(text).toContain("Le prochain cours : vendredi 9 octobre à 09h00, Salle 12.");
  });

  it("parle de la série quand plusieurs cours ont été manqués", () => {
    const text = buildAbsenceFollowupMessage({ firstName: "Omar", senderFirstName: null, missedAt: "2026-10-07T07:00:00Z", streak: 3, nextSession: null });
    expect(text).toContain("aux 3 derniers cours de français");
    expect(text).toContain("C'est ParlerEmploi Formation.");
    expect(text).not.toContain("prochain cours");
  });
});

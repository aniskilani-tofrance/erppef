import { describe, expect, it } from "vitest";
import {
  clockLabel,
  formatClock,
  orderForSpacing,
  parseClock,
  spreadTimes,
  whenForInvitation,
} from "@/lib/admission/convocation";
import { buildMeetingInvitationMessage, buildMeetingReminderMessage } from "@/lib/admission/messages";
import { DEFAULT_TEMPLATES } from "@/lib/admission/templates";
import {
  pickConvocationTests,
  PUBLIC_ERP_URL,
  testBeforeSentence,
  testLink,
  type ConvocationTestRow,
} from "@/lib/placement/convocation-test";

const MEETING = {
  startsAt: "2026-11-07T13:00:00.000Z", // samedi 7 novembre 2026, 14h00 à Paris
  endsAt: "2026-11-07T15:00:00.000Z",
  place: "Salle 12 — 14 rue Alexandre Bachelet, Saint-Ouen",
};

describe("heures de convocation", () => {
  it("lit et écrit des heures « HH:MM »", () => {
    expect(parseClock("14:20")).toBe(860);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("23:59")).toBe(1439);
    for (const bad of ["", "24:00", "14:60", "9:30", "14h20", "abc"]) expect(parseClock(bad), bad).toBeNull();
    expect(formatClock(860)).toBe("14:20");
    expect(formatClock(5)).toBe("00:05");
  });

  it("libellé « 14h20 » à l'heure de Paris", () => {
    expect(clockLabel("2026-11-07T13:20:00.000Z")).toBe("14h20");
    expect(clockLabel("2026-07-07T12:00:00.000Z")).toBe("14h00"); // heure d'été
  });

  it("espace les heures : première heure, puis une toutes les N minutes", () => {
    expect(spreadTimes("14:00", 15, 5)).toEqual({ ok: true, times: ["14:00", "14:15", "14:30", "14:45", "15:00"] });
    expect(spreadTimes("14:00", 20, 1)).toEqual({ ok: true, times: ["14:00"] });
    expect(spreadTimes("14:00", 15, 0)).toEqual({ ok: true, times: [] });
  });

  it("refuse une heure invalide, un pas hors limites ou un dépassement de minuit", () => {
    expect(spreadTimes("25:00", 15, 3).ok).toBe(false);
    expect(spreadTimes("14:00", 4, 3).ok).toBe(false);
    expect(spreadTimes("14:00", 121, 3).ok).toBe(false);
    expect(spreadTimes("14:00", 7.5, 3).ok).toBe(false);
    expect(spreadTimes("22:00", 60, 4).ok).toBe(false); // 22h, 23h, 00h, 01h
    expect(spreadTimes("22:00", 60, 2).ok).toBe(true); // 22h, 23h
    expect(spreadTimes("23:00", 30, 3).ok).toBe(false); // 23h, 23h30, 00h
  });

  it("ordre de passage : par inscription ou par nom, sans modifier la liste d'origine", () => {
    const rows = [
      { id: "a", createdAt: "2026-10-26T09:00:00Z", lastName: "Zahra", firstName: "Amel" },
      { id: "b", createdAt: "2026-10-25T09:00:00Z", lastName: "Diallo", firstName: "Binta" },
      { id: "c", createdAt: "2026-10-27T09:00:00Z", lastName: "Alami", firstName: "Chaima" },
    ];
    const before = rows.map((r) => r.id);
    expect(orderForSpacing(rows, "inscription").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(orderForSpacing(rows, "alphabetique").map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("à égalité d'arrivée, l'ordre est stable (par nom)", () => {
    const same = "2026-10-26T09:00:00Z";
    const rows = [
      { id: "2", createdAt: same, lastName: "Zoubir", firstName: "A" },
      { id: "1", createdAt: same, lastName: "Alami", firstName: "B" },
    ];
    expect(orderForSpacing(rows, "inscription").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("la personne voit SON heure, sans « jusqu'à » ; sans heure propre, celle de la réunion", () => {
    expect(whenForInvitation(MEETING, null)).toBe(MEETING);
    const mine = whenForInvitation(MEETING, "2026-11-07T13:20:00.000Z");
    expect(mine.startsAt).toBe("2026-11-07T13:20:00.000Z");
    expect(mine.endsAt).toBeNull();
    expect(mine.place).toBe(MEETING.place);

    const text = buildMeetingInvitationMessage({ learnerFirstName: "Fatima", senderFirstName: "Marie", meeting: mine });
    expect(text).toContain("à 14h20");
    expect(text).not.toContain("jusqu'à");
    expect(buildMeetingInvitationMessage({ learnerFirstName: "Fatima", senderFirstName: "Marie", meeting: MEETING })).toContain("à 14h00 (jusqu'à 16h00)");
  });
});

const test = (learner: string, status: "en_attente" | "fait", token: string, at = "2026-10-20T10:00:00Z"): ConvocationTestRow => ({
  learner_id: learner,
  status,
  token,
  created_at: at,
});

describe("test de niveau dans la convocation : le bon lien pour la bonne personne", () => {
  it("chaque personne ne reçoit que le lien de SON test", () => {
    const learners = [
      { id: "L1", level_assessed: null },
      { id: "L2", level_assessed: null },
    ];
    const r = pickConvocationTests(learners, [test("L1", "en_attente", "tok-1"), test("L2", "en_attente", "tok-2")]);
    expect(r.pending.get("L1")).toBe("tok-1");
    expect(r.pending.get("L2")).toBe("tok-2");
    expect(r.missing).toEqual([]);
  });

  it("un test d'un autre apprenant n'est jamais attribué", () => {
    const r = pickConvocationTests([{ id: "L1", level_assessed: null }], [test("L2", "en_attente", "tok-2")]);
    expect(r.pending.has("L1")).toBe(false);
    expect(r.missing).toEqual(["L1"]);
    expect([...r.pending.values()]).not.toContain("tok-2");
  });

  it("niveau déjà connu ou test déjà fait : rien à faire, aucun lien", () => {
    const learners = [
      { id: "A", level_assessed: "A2" }, // niveau retenu (test fait, ou entretien oral)
      { id: "B", level_assessed: null }, // test fait mais niveau non retenu
      { id: "C", level_assessed: null }, // à faire
    ];
    const tests = [test("A", "en_attente", "tok-a"), test("B", "fait", "tok-b"), test("C", "en_attente", "tok-c")];
    const r = pickConvocationTests(learners, tests);
    expect([...r.done].sort()).toEqual(["A", "B"]);
    expect([...r.pending.keys()]).toEqual(["C"]);
  });

  it("plusieurs tests en attente : le plus récent ; sans test : à créer", () => {
    const tests = [test("L1", "en_attente", "vieux", "2026-10-01T10:00:00Z"), test("L1", "en_attente", "recent", "2026-10-20T10:00:00Z")];
    const r = pickConvocationTests([{ id: "L1", level_assessed: null }, { id: "L9", level_assessed: null }], tests);
    expect(r.pending.get("L1")).toBe("recent");
    expect(r.missing).toEqual(["L9"]);
  });

  it("lien complet vers la page du test, avec l'adresse publique de l'ERP", () => {
    expect(testLink("abc")).toBe(`${PUBLIC_ERP_URL}/test/abc`);
    expect(testLink("abc", "https://exemple.fr/")).toBe("https://exemple.fr/test/abc");
  });

  it("phrase ajoutée à la convocation : absente sans lien", () => {
    expect(testBeforeSentence(null)).toBeNull();
    expect(testBeforeSentence("  ")).toBeNull();
    const s = testBeforeSentence("https://pef-erp.vercel.app/test/abc")!;
    expect(s).toContain("Avant la réunion");
    expect(s).toContain("Ce n'est pas un examen");
    expect(s.endsWith("https://pef-erp.vercel.app/test/abc")).toBe(true);
  });
});

describe("messages avec le test de niveau", () => {
  const URL = `${PUBLIC_ERP_URL}/test/3f2a9c1d-0000-4000-8000-000000000001`;
  const base = { learnerFirstName: "Fatima", senderFirstName: "Marie", meeting: MEETING };

  it("la convocation contient le lien personnel, avant la demande de confirmation", () => {
    const out = buildMeetingInvitationMessage({ ...base, testUrl: URL });
    expect(out).toContain(URL);
    expect(out.indexOf(URL)).toBeLessThan(out.indexOf("OUI ou NON"));
    expect(out).not.toMatch(/\{[a-z_]+\}/);
  });

  it("sans lien (test déjà fait), la convocation est inchangée et sans trou", () => {
    const out = buildMeetingInvitationMessage({ ...base, testUrl: null });
    expect(out).not.toContain("test de niveau");
    expect(out).not.toMatch(/\n\n\n/);
    expect(out).toBe(buildMeetingInvitationMessage(base));
  });

  it("le rappel de la veille rappelle le lien tant que le test n'est pas fait", () => {
    expect(buildMeetingReminderMessage({ ...base, testUrl: URL })).toContain(URL);
    expect(buildMeetingReminderMessage({ ...base, testUrl: null })).not.toContain("/test/");
  });

  it("un modèle retouché sans {test_avant} reçoit quand même le lien, à la fin", () => {
    const custom = { ...DEFAULT_TEMPLATES, convocation: "Bonjour {prenom}, réunion {date}." };
    const out = buildMeetingInvitationMessage({ ...base, testUrl: URL, templates: custom });
    expect(out.startsWith("Bonjour Fatima, réunion")).toBe(true);
    expect(out.endsWith(URL)).toBe(true);
    expect(buildMeetingInvitationMessage({ ...base, testUrl: null, templates: custom })).not.toContain("/test/");
  });

  it("le lien n'est ajouté qu'une fois, avec le modèle par défaut", () => {
    const out = buildMeetingInvitationMessage({ ...base, testUrl: URL });
    expect(out.split(URL).length - 1).toBe(1);
  });
});

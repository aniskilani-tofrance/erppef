import { describe, expect, it } from "vitest";
import { buildDispatchEmail, classifySessions, dispatchWindow, parseEmails, type DispatchSession } from "@/lib/emargement/dispatch";

describe("envoi hebdomadaire des feuilles d'émargement — destinataires et fenêtre", () => {
  it("nettoie une liste d'adresses tapée librement", () => {
    expect(parseEmails("mba@mairie-saint-ouen.fr, GFenzi@mairie-saint-ouen.fr ; nchahbani@mairie-saint-ouen.fr\nmba@mairie-saint-ouen.fr pas-un-email")).toEqual([
      "mba@mairie-saint-ouen.fr",
      "gfenzi@mairie-saint-ouen.fr",
      "nchahbani@mairie-saint-ouen.fr",
    ]);
    expect(parseEmails(["a@b.fr", " ", "A@B.FR"])).toEqual(["a@b.fr"]);
    expect(parseEmails(null)).toEqual([]);
  });

  it("la fenêtre part du dernier envoi, ou de 7 jours en arrière la première fois", () => {
    const now = new Date("2026-10-09T14:00:00Z");
    expect(dispatchWindow(now, null).from.toISOString()).toBe("2026-10-02T14:00:00.000Z");
    expect(dispatchWindow(now, "2026-10-02T14:03:00Z").from.toISOString()).toBe("2026-10-02T14:03:00.000Z");
    expect(dispatchWindow(now, null).to).toBe(now);
  });

  it("classe les séances terminées dans la fenêtre : clôturées, manquantes ; ignore annulées et futures", () => {
    const window = { from: new Date("2026-10-02T14:00:00Z"), to: new Date("2026-10-09T14:00:00Z") };
    const sessions: DispatchSession[] = [
      { id: "lun", starts_at: "2026-10-05T07:00:00Z", ends_at: "2026-10-05T11:00:00Z", status: "realisee", attendance_closed_at: "2026-10-05T11:10:00Z" },
      { id: "mer", starts_at: "2026-10-07T07:00:00Z", ends_at: "2026-10-07T11:00:00Z", status: "planifiee", attendance_closed_at: null },
      { id: "annulee", starts_at: "2026-10-06T07:00:00Z", ends_at: "2026-10-06T11:00:00Z", status: "annulee", attendance_closed_at: null },
      { id: "samedi", starts_at: "2026-10-10T07:00:00Z", ends_at: "2026-10-10T11:30:00Z", status: "planifiee", attendance_closed_at: null },
      { id: "vieux", starts_at: "2026-10-01T07:00:00Z", ends_at: "2026-10-01T11:00:00Z", status: "realisee", attendance_closed_at: "2026-10-01T12:00:00Z" },
    ];
    const { ready, missing } = classifySessions(sessions, window);
    expect(ready.map((s) => s.id)).toEqual(["lun"]);
    expect(missing.map((s) => s.id)).toEqual(["mer"]);
  });
});

describe("envoi hebdomadaire des feuilles d'émargement — email", () => {
  const base = {
    groupName: "Cours municipaux A1 — Cordon",
    siteName: "Cordon",
    funderName: "Ville de Saint-Ouen (via BOP104)",
    from: new Date("2026-10-02T14:00:00Z"),
    to: new Date("2026-10-09T14:00:00Z"),
    sheets: [{ sessionId: "s1", startsAt: "2026-10-05T07:00:00Z", endsAt: "2026-10-05T11:00:00Z", present: 10, enrolled: 12 }],
    missing: [{ startsAt: "2026-10-07T07:00:00Z", endsAt: "2026-10-07T11:00:00Z" }],
  };

  it("objet et corps en français, séances jointes et manquantes listées", () => {
    const { subject, text } = buildDispatchEmail({ ...base, mode: "auto" });
    expect(subject).toBe("Feuilles d'émargement — Cours municipaux A1 — Cordon — semaine du vendredi 2 octobre au vendredi 9 octobre 2026");
    expect(text).toContain("(site Cordon)");
    expect(text).toContain("financé par Ville de Saint-Ouen (via BOP104)");
    expect(text).toContain("- lundi 5 octobre, 09h00-13h00 : 10 présents sur 12 inscrits");
    expect(text).toContain("n'est pas encore clôturée");
    expect(text).toContain("- mercredi 7 octobre, 09h00-13h00");
    expect(text).not.toContain("[TEST]");
  });

  it("le mode test le dit clairement et cite les vrais destinataires", () => {
    const { subject, text } = buildDispatchEmail({ ...base, mode: "test", realRecipients: ["mba@mairie-saint-ouen.fr", "gfenzi@mairie-saint-ouen.fr (copie)"] });
    expect(subject.startsWith("[TEST] ")).toBe(true);
    expect(text).toContain("Les destinataires réels seraient : mba@mairie-saint-ouen.fr, gfenzi@mairie-saint-ouen.fr (copie)");
  });
});

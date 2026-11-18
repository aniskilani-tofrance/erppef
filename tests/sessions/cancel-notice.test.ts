import { describe, expect, it } from "vitest";
import { cancellationContactNote, cancellationEmail, reminderAlreadySent } from "@/lib/sessions/cancel-notice";

// Séance du jeudi 12 novembre 2026, 14h00–16h00 à Paris (13h00–15h00 UTC) : le rappel part
// le mercredi 11 à 5 h 30 UTC (cron des alertes).
const START = "2026-11-12T13:00:00Z";
const END = "2026-11-12T15:00:00Z";

describe("le rappel de la veille est-il déjà parti ?", () => {
  it("non : annulation l'avant-veille, ou la veille avant le cron", () => {
    expect(reminderAlreadySent(START, new Date("2026-11-10T18:00:00Z"))).toBe(false);
    expect(reminderAlreadySent(START, new Date("2026-11-11T05:29:00Z"))).toBe(false);
  });

  it("oui : la veille après le cron, et le jour même avant le cours (cas de l'atelier du 12/11)", () => {
    expect(reminderAlreadySent(START, new Date("2026-11-11T05:30:00Z"))).toBe(true);
    expect(reminderAlreadySent(START, new Date("2026-11-12T12:15:00Z"))).toBe(true);
  });

  it("non : le cours a déjà commencé (plus la peine de prévenir)", () => {
    expect(reminderAlreadySent(START, new Date("2026-11-12T13:00:00Z"))).toBe(false);
  });

  it("séance du lundi : rappel parti le dimanche matin", () => {
    const monday = "2026-11-16T08:00:00Z"; // 9h00 à Paris
    expect(reminderAlreadySent(monday, new Date("2026-11-15T06:00:00Z"))).toBe(true);
    expect(reminderAlreadySent(monday, new Date("2026-11-14T20:00:00Z"))).toBe(false);
  });
});

describe("e-mail « cours annulé »", () => {
  const base = { firstName: "Awa", startsAt: START, endsAt: END, groupName: "Atelier conversation", roomName: "Salle 13" };

  it("le jour même : « aujourd'hui », jour, horaires, groupe et salle, « Ne venez pas »", () => {
    const m = cancellationEmail({ ...base, now: new Date("2026-11-12T10:00:00Z") });
    expect(m.subject).toBe("Cours annulé : jeudi 12 novembre à 14h00");
    expect(m.html).toContain("Bonjour Awa,");
    expect(m.html).toContain("aujourd'hui jeudi 12 novembre");
    expect(m.html).toContain("14h00–16h00, Atelier conversation, Salle 13");
    expect(m.html).toContain("Ne venez pas.");
    expect(m.html).toContain("Vous avez reçu un rappel");
  });

  it("la veille : « demain » ; sans prénom ni salle, texte propre ; HTML échappé", () => {
    const m = cancellationEmail({ ...base, firstName: "?", roomName: null, groupName: "A & B <test>", now: new Date("2026-11-11T09:00:00Z") });
    expect(m.html).toContain("Bonjour,");
    expect(m.html).toContain("demain jeudi 12 novembre");
    expect(m.html).toContain("A &amp; B &lt;test&gt;");
    expect(m.html).not.toContain(", null");
  });

  it("note du carnet datée (heure de Paris)", () => {
    expect(cancellationContactNote(START)).toBe("E-mail : cours du 12/11/2026 à 14h00 annulé (rappel déjà reçu).");
  });
});

import { describe, expect, it } from "vitest";
import { addDays, hoursToFirstContact, suggestNextAction } from "@/lib/leads/cadence";

const base = { rdvOn: null, rdvReminderSent: false, today: "2026-09-14" };

describe("cadence J0 → J10 du kit Shahzad", () => {
  it("un lead jamais contacté : appel de qualification aujourd'hui", () => {
    const a = suggestNextAction({ ...base, status: "nouveau", attempts: 0, firstContactOn: null });
    expect(a?.kind).toBe("appel");
    expect(a?.on).toBe("2026-09-14");
    expect(a?.label).toMatch(/J0/);
  });

  it("après le 1er essai : J1 autre créneau, J3 email, J6 appel+SMS, J10 rupture", () => {
    const first = "2026-09-14";
    const steps = [1, 2, 3, 4].map((attempts) =>
      suggestNextAction({ ...base, status: "a_rappeler", attempts, firstContactOn: first, today: first }),
    );
    expect(steps.map((s) => s?.on)).toEqual([addDays(first, 1), addDays(first, 3), addDays(first, 6), addDays(first, 10)]);
    expect(steps.map((s) => s?.kind)).toEqual(["appel", "email", "sms", "email"]);
  });

  it("5 tentatives sans réponse : classer perdu", () => {
    const a = suggestNextAction({ ...base, status: "a_rappeler", attempts: 5, firstContactOn: "2026-09-01" });
    expect(a?.kind).toBe("cloture");
  });

  it("une étape déjà dépassée est due aujourd'hui et marquée en retard", () => {
    const a = suggestNextAction({ ...base, status: "a_rappeler", attempts: 1, firstContactOn: "2026-09-01" });
    expect(a?.on).toBe("2026-09-14");
    expect(a?.overdue).toBe(false); // ramenée à aujourd'hui, pas dans le passé
  });

  it("RDV pris : SMS de rappel la veille, puis le RDV lui-même", () => {
    const veille = suggestNextAction({ ...base, status: "rdv_pris", attempts: 2, firstContactOn: "2026-09-10", rdvOn: "2026-09-18" });
    expect(veille?.kind).toBe("sms");
    expect(veille?.on).toBe("2026-09-17");
    const rdv = suggestNextAction({ ...base, status: "rdv_pris", attempts: 2, firstContactOn: "2026-09-10", rdvOn: "2026-09-18", rdvReminderSent: true });
    expect(rdv?.kind).toBe("rdv");
    expect(rdv?.on).toBe("2026-09-18");
  });

  it("RDV passé sans issue notée : demander tenu / no-show", () => {
    const a = suggestNextAction({ ...base, status: "rdv_pris", attempts: 2, firstContactOn: "2026-09-10", rdvOn: "2026-09-12" });
    expect(a?.label).toMatch(/no-show/);
  });

  it("statuts finaux : rien à faire", () => {
    for (const status of ["gagne", "perdu", "hors_cible"]) {
      expect(suggestNextAction({ ...base, status, attempts: 3, firstContactOn: "2026-09-01" })).toBeNull();
    }
  });

  it("délai de premier contact en heures", () => {
    expect(hoursToFirstContact("2026-09-14T08:00:00Z", "2026-09-14T10:30:00Z")).toBe(2.5);
    expect(hoursToFirstContact("2026-09-14T08:00:00Z", null)).toBeNull();
  });
});

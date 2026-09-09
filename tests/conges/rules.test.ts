import { describe, expect, it } from "vitest";
import { daysBetween, initialStatus, needsApproval, requestWording, sessionsInRange } from "@/lib/conges/rules";

describe("règles du module congés", () => {
  it("salarié = demande à valider ; vacataire et prestataire = enregistrée directement", () => {
    expect(needsApproval("salarie")).toBe(true);
    expect(needsApproval("vacataire")).toBe(false);
    expect(needsApproval("prestataire")).toBe(false);
    expect(initialStatus("salarie")).toBe("en_attente");
    expect(initialStatus("vacataire")).toBe("approuvee");
    expect(requestWording("salarie").button).toBe("Demander un congé");
    expect(requestWording("prestataire").button).toBe("Déclarer une absence");
  });

  it("compte les jours inclus et les séances impactées", () => {
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(1);
    expect(daysBetween("2026-10-05", "2026-10-09")).toBe(5);
    expect(sessionsInRange(["2026-10-05", "2026-10-06", "2026-10-12"], "2026-10-05", "2026-10-09")).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { deferredSmsCode } from "@/lib/leads/automations";

describe("routage automatique des SMS leads", () => {
  it("confirme la demande à un nouveau lead", () => {
    expect(deferredSmsCode({ status: "nouveau", rdv_outcome: null, next_action: null })).toBe("demande_recue");
  });

  it("confirme un créneau Calendly de qualification", () => {
    expect(deferredSmsCode({
      status: "a_rappeler",
      rdv_outcome: null,
      next_action: "Appel de qualification réservé via Calendly — 17 septembre 2026 à 10:00",
    })).toBe("qualification_reservee");
  });

  it("confirme un rendez-vous expert puis relance un no-show", () => {
    expect(deferredSmsCode({ status: "rdv_pris", rdv_outcome: "a_venir", next_action: null })).toBe("confirmation_rdv");
    expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: "no_show", next_action: null })).toBe("no_show");
  });

  it("n'envoie rien pour une action non déterministe", () => {
    expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: null, next_action: "Rappeler à la coupure" })).toBeNull();
  });
});

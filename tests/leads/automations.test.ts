import { describe, expect, it } from "vitest";
import { deferredSmsCode } from "@/lib/leads/automations";

describe("routage automatique des SMS leads", () => {
  it("laisse l'accusé de réception d'un nouveau lead au circuit différé", () => {
    // Depuis le 19/09/2026, l'invitation à réserver un créneau n'est plus rattrapée ici :
    // elle passe par sendPendingLeadIntro, qui attend dix minutes et ne l'envoie qu'à ceux
    // qui n'ont pas réservé dans le Calendly de la landing. Voir invitation-differee.test.ts.
    expect(deferredSmsCode({ status: "nouveau", rdv_outcome: null, next_action: null })).toBeNull();
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

import { describe, expect, it } from "vitest";
import { deferredSmsCode, DELAI_AVANT_INVITATION_MS } from "@/lib/leads/automations";

// Sur la landing, le formulaire s'efface une fois validé et le Calendly de qualification
// s'affiche à sa place, dans la même section. Inviter le restaurateur à choisir un créneau
// dans la seconde qui suit reviendrait donc à lui proposer ce qu'il est en train de faire.
// L'invitation attend, et ne part qu'à ceux qui sont repartis sans réserver.

describe("invitation différée à réserver un créneau", () => {
  it("laisse dix minutes au restaurateur", () => {
    expect(DELAI_AVANT_INVITATION_MS).toBe(600_000);
  });

  it("le rattrapage ne renvoie jamais l'accusé de réception d'un lead encore nouveau", () => {
    expect(deferredSmsCode({ status: "nouveau", rdv_outcome: null, next_action: null })).toBeNull();
  });

  it("le rattrapage couvre toujours les autres moments du parcours", () => {
    expect(deferredSmsCode({ status: "rdv_pris", rdv_outcome: null, next_action: null })).toBe("confirmation_rdv");
    expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: "no_show", next_action: null })).toBe("no_show");
    expect(deferredSmsCode({ status: "a_rappeler", rdv_outcome: null, next_action: "Appel de qualification réservé via Calendly" })).toBe("qualification_reservee");
  });
});

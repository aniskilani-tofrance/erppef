import { describe, expect, it } from "vitest";
import { SMS_TEMPLATES } from "@/lib/leads/templates";

// Un expéditeur alphanumérique comme « ParlerResto » ne peut pas recevoir de réponse :
// c'est un nom de marque, pas un numéro. Aucun SMS ne doit donc inviter le restaurateur
// à répondre, sous peine de promettre un canal qui n'existe pas.

describe("les SMS ne promettent pas de canal de retour inexistant", () => {
  it("aucun modèle n'invite à répondre au SMS", () => {
    const fautifs = SMS_TEMPLATES.filter((t) => /répond(?:ez|re)[^.]{0,30}(ce )?(SMS|message)/i.test(t.text));
    expect(fautifs.map((t) => t.code)).toEqual([]);
  });

  it("chaque modèle laisse au moins une porte de sortie au restaurateur", () => {
    for (const t of SMS_TEMPLATES) {
      const porte = /\{calendly\}|lien de modification|nous vous appellerons|un conseiller ParlerEmploi vous appelle|recaler/i.test(t.text);
      expect(porte, `le modèle ${t.code} n'indique aucune suite possible`).toBe(true);
    }
  });
});

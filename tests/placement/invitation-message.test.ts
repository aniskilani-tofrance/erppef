import { describe, expect, it } from "vitest";
import { buildPlacementInvitation } from "@/lib/placement/invitation-message";

const url = "https://pef-erp.vercel.app/test/abc123";

describe("message d'invitation au test de positionnement", () => {
  it("contient le lien tel quel, sur sa propre ligne, et les consignes clés", () => {
    const msg = buildPlacementInvitation({ url, senderFirstName: "Marie" });
    expect(msg.split("\n")).toContain(url);
    expect(msg).toContain("Je suis Marie de Parler Emploi Formation.");
    expect(msg).toContain("Ce n'est pas une évaluation");
    expect(msg).toContain("téléphone chargé");
    expect(msg).toContain("son au maximum");
    expect(msg).toContain("entre 5 et 35 minutes");
    expect(msg).toContain("réunion de rentrée");
    expect(msg.trimEnd().endsWith("Bon courage,\nMarie")).toBe(true);
  });

  it("se passe du prénom quand la personne connectée n'en a pas", () => {
    const msg = buildPlacementInvitation({ url, senderFirstName: null });
    expect(msg).toContain("Je vous écris de la part de Parler Emploi Formation.");
    expect(msg).not.toContain("Je suis ");
    expect(msg.trimEnd().endsWith("L'équipe Parler Emploi Formation")).toBe(true);
    // Idem pour un prénom vide
    expect(buildPlacementInvitation({ url, senderFirstName: "  " })).toBe(msg);
  });

  it("n'a ni double espace ni ligne avec des espaces parasites (collage WhatsApp/SMS propre)", () => {
    const msg = buildPlacementInvitation({ url, senderFirstName: "Anis" });
    expect(msg).not.toMatch(/ {2}/);
    expect(msg).not.toMatch(/ \n/);
  });
});

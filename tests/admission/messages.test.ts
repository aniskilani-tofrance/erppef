import { describe, expect, it } from "vitest";
import {
  buildFirstContactMessage,
  buildMeetingInvitationMessage,
  buildMeetingReminderMessage,
  formatMeetingWhen,
  textToHtml,
} from "@/lib/admission/messages";

// 16/09/2026 14:00 Paris (UTC+2) = 12:00Z
const meeting = { startsAt: "2026-09-16T12:00:00Z", endsAt: "2026-09-16T14:00:00Z", place: "Salle 12, 1 place Martin Levasseur" };

describe("messages du parcours d'admission", () => {
  it("formate la date de réunion en français, heure de Paris", () => {
    expect(formatMeetingWhen(meeting)).toBe("mercredi 16 septembre 2026 à 14h00 (jusqu'à 16h00)");
    expect(formatMeetingWhen({ startsAt: meeting.startsAt })).toBe("mercredi 16 septembre 2026 à 14h00");
  });

  it("premier contact : prénom, signature, demande de réponse sur WhatsApp", () => {
    const msg = buildFirstContactMessage({ learnerFirstName: "Fatima", senderFirstName: "Marie" });
    expect(msg.startsWith("Bonjour Fatima,")).toBe(true);
    expect(msg).toContain("Je suis Marie de Parler Emploi Formation.");
    expect(msg).toContain("sur WhatsApp");
    expect(msg.trimEnd().endsWith("Marie")).toBe(true);
    const anonymous = buildFirstContactMessage({ learnerFirstName: null, senderFirstName: null });
    expect(anonymous.startsWith("Bonjour,")).toBe(true);
    expect(anonymous).toContain("L'équipe Parler Emploi Formation");
  });

  it("convocation : date, lieu, entretien oral rassurant, demande de confirmation", () => {
    const msg = buildMeetingInvitationMessage({ learnerFirstName: "Ali", senderFirstName: "Anis", meeting });
    expect(msg).toContain("📅 mercredi 16 septembre 2026 à 14h00");
    expect(msg).toContain("📍 Salle 12, 1 place Martin Levasseur");
    expect(msg).toContain("Ce n'est pas un examen");
    expect(msg).toContain("OUI ou NON");
    const noOral = buildMeetingInvitationMessage({ learnerFirstName: "Ali", senderFirstName: "Anis", meeting, withOralTest: false });
    expect(noOral).not.toContain("entretien oral");
  });

  it("rappel : court, avec la date et le lieu", () => {
    const msg = buildMeetingReminderMessage({ learnerFirstName: "Ali", senderFirstName: "Anis", meeting });
    expect(msg).toContain("Petit rappel");
    expect(msg).toContain("mercredi 16 septembre 2026 à 14h00");
    expect(msg.split("\n").length).toBeLessThan(12);
  });

  it("aucun message n'a de double espace ni d'espace en fin de ligne (collage propre)", () => {
    for (const msg of [
      buildFirstContactMessage({ learnerFirstName: "A", senderFirstName: "B" }),
      buildMeetingInvitationMessage({ learnerFirstName: "A", senderFirstName: "B", meeting }),
      buildMeetingReminderMessage({ learnerFirstName: "A", senderFirstName: "B", meeting }),
    ]) {
      expect(msg).not.toMatch(/ {2}/);
      expect(msg).not.toMatch(/ \n/);
    }
  });

  it("convertit le texte en HTML échappé pour l'email", () => {
    expect(textToHtml("Bonjour <A>,\nligne 2\n\nParagraphe & fin")).toBe(
      "<p>Bonjour &lt;A&gt;,<br/>ligne 2</p>\n<p>Paragraphe &amp; fin</p>",
    );
  });
});

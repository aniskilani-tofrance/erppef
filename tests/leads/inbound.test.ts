import { describe, expect, it } from "vitest";
import { normalizeInbound } from "@/lib/leads/inbound";

describe("webhook leads entrants : normalisation", () => {
  it("formulaire de landing (Manus / Brevo) avec champs en français", () => {
    const r = normalizeInbound({
      email: "karim@chezkarim.fr",
      attributes: { PRENOM: "Karim", NOM: "Benali", SMS: "+33612345678", ENTREPRISE: "Chez Karim", VILLE: "Saint-Denis 93200", POSTES: "commis, plongeur", NB_POSTES: "2", TYPE_ETABLISSEMENT: "Restaurant traditionnel" },
      utm_source: "facebook",
      utm_campaign: "V2 galère",
    });
    expect(r?.kind).toBe("lead");
    if (r?.kind !== "lead") return;
    expect(r.company).toBe("Chez Karim");
    expect(r.contactName).toBe("Karim Benali");
    expect(r.phone).toBe("+33612345678");
    expect(r.city).toBe("Saint-Denis");
    expect(r.postalCode).toBe("93200");
    expect(r.positionsCount).toBe(2);
    expect(r.segment).toBe("traditionnel");
    expect(r.source).toBe("formulaire_meta");
    expect(r.campaign).toBe("V2 galère");
  });

  it("lead Meta relayé par Make (field_data)", () => {
    const r = normalizeInbound({
      field_data: [
        { name: "Nom du restaurant", values: ["McDonald's Saint-Ouen"] },
        { name: "full_name", values: ["Nadia Kaci"] },
        { name: "phone_number", values: ["+33 7 11 22 33 44"] },
        { name: "email", values: ["nadia@example.com"] },
        { name: "Quels postes ?", values: ["équipiers"] },
      ],
      ad_name: "cover-ad1-turnover",
      platform: "ig",
    });
    expect(r?.kind).toBe("lead");
    if (r?.kind !== "lead") return;
    expect(r.company).toBe("McDonald's Saint-Ouen");
    expect(r.contactName).toBe("Nadia Kaci");
    expect(r.positions).toBe("équipiers");
    expect(r.source).toBe("formulaire_meta");
    expect(r.campaign).toBe("cover-ad1-turnover");
  });

  it("formulaire simple sans entreprise : on crée quand même avec le contact", () => {
    const r = normalizeInbound({ name: "Yacine", telephone: "0612345678", message: "je cherche un plongeur" });
    expect(r?.kind).toBe("lead");
    if (r?.kind !== "lead") return;
    expect(r.company).toBe("Restaurant de Yacine");
    expect(r.message).toBe("je cherche un plongeur");
    expect(r.source).toBe("site");
  });

  it("payload vide ou sans contact → null", () => {
    expect(normalizeInbound({ hello: "world" })).toBeNull();
    expect(normalizeInbound("x")).toBeNull();
  });

  it("Calendly invitee.created : RDV, mode, téléphone dans les réponses", () => {
    const r = normalizeInbound({
      event: "invitee.created",
      payload: {
        name: "Karim Benali",
        email: "karim@chezkarim.fr",
        text_reminder_number: "+33612345678",
        scheduled_event: { name: "Appel découverte 15 min", start_time: "2026-09-18T13:00:00.000000Z", location: { type: "outbound_call", location: "+33612345678" }, event_memberships: [{ user_email: "mohammad.shahzad9@gmail.com" }] },
        questions_and_answers: [{ question: "Nom du restaurant", answer: "Chez Karim" }],
      },
    });
    expect(r?.kind).toBe("calendly");
    if (r?.kind !== "calendly") return;
    expect(r.action).toBe("created");
    expect(r.startsAt).toBe("2026-09-18T13:00:00.000000Z");
    expect(r.locationKind).toBe("telephone");
    expect(r.phone).toBe("+33612345678");
    expect(r.answers).toContain("Chez Karim");
    expect(r.hostEmail).toBe("mohammad.shahzad9@gmail.com");
    expect(r.eventName).toBe("Appel découverte 15 min");
  });

  it("Calendly invitee.canceled", () => {
    const r = normalizeInbound({ event: "invitee.canceled", payload: { name: "K", email: "k@x.fr", cancellation: { reason: "coup de feu" }, scheduled_event: { start_time: "2026-09-18T13:00:00Z" } } });
    expect(r?.kind).toBe("calendly");
    if (r?.kind !== "calendly") return;
    expect(r.action).toBe("canceled");
    expect(r.cancelReason).toBe("coup de feu");
  });
});

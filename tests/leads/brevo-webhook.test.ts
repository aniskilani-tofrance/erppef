import { describe, expect, it } from "vitest";
import {
  emailStatusForBrevoEvent,
  journalLineForBrevoEvent,
  mergeEmailStatus,
  parseBrevoWebhook,
  stopReasonForEmailStatus,
} from "@/lib/leads/brevo-webhook";
import { noteLisible, titreEmail } from "@/lib/leads/journal";
import { BREVO_LEAD_EVENTS } from "@/lib/leads/brevo";

// Brevo raconte à l'ERP le sort de chaque e-mail. Ces tests verrouillent la lecture du
// payload, la famille retenue sur la fiche, et ce que chaque retour fait à la séquence.

const payload = {
  event: "hard_bounce",
  email: "Karim@BistrotDesDocks.fr",
  id: 123456,
  date: "2026-09-29 10:15:00",
  ts_event: 1790676900,
  "message-id": "<202609291015.12345@smtp-relay.mailin.fr>",
  subject: "Karim, votre demande sur parlerresto",
  tag: '["poei_restauration","poei_lead_relance_j3"]',
  tags: ["poei_restauration", "poei_lead_relance_j3"],
  "X-Mailin-custom": "lead_ref:L-0042|event:poei_lead_relance_j3",
  reason: "550 user unknown",
};

describe("lecture d'un retour Brevo", () => {
  it("retrouve la fiche, l'e-mail concerné, l'identifiant et la date", () => {
    const [ev] = parseBrevoWebhook(payload);
    expect(ev.event).toBe("hard_bounce");
    expect(ev.email).toBe("karim@bistrotdesdocks.fr");
    expect(ev.leadNo).toBe(42);
    expect(ev.leadEvent).toBe("poei_lead_relance_j3");
    expect(ev.messageId).toBe("<202609291015.12345@smtp-relay.mailin.fr>");
    expect(ev.reason).toBe("550 user unknown");
    expect(ev.occurredAt).toBe(new Date(1790676900 * 1000).toISOString());
    expect(ev.tags).toEqual(["poei_restauration", "poei_lead_relance_j3"]);
  });

  it("accepte un tableau, ignore l'illisible, retrouve l'événement par les tags à défaut d'en-tête", () => {
    const events = parseBrevoWebhook([
      { event: "delivered", email: "a@x.fr", tag: '["poei_restauration","poei_lead_nouveau"]' },
      "n'importe quoi",
      { pas_d_evenement: true },
      { event: "opened", email: "b@x.fr", date: "2026-09-29 11:00:00" },
    ], new Date("2026-09-29T12:00:00.000Z"));
    expect(events.map((e) => e.event)).toEqual(["delivered", "opened"]);
    expect(events[0].leadNo).toBeNull();
    expect(events[0].leadEvent).toBe("poei_lead_nouveau");
    expect(events[1].occurredAt).toBe("2026-09-29T11:00:00.000Z");
  });

  it("sans date lisible, prend l'heure de réception", () => {
    const now = new Date("2026-09-29T12:00:00.000Z");
    expect(parseBrevoWebhook({ event: "spam" }, now)[0].occurredAt).toBe(now.toISOString());
  });
});

describe("ce qu'un retour fait à la fiche et à la séquence", () => {
  it("classe les événements en cinq familles, ignore le reste", () => {
    expect(emailStatusForBrevoEvent("delivered")).toBe("delivered");
    expect(emailStatusForBrevoEvent("soft_bounce")).toBe("soft_bounce");
    for (const e of ["hard_bounce", "blocked", "invalid_email"]) expect(emailStatusForBrevoEvent(e)).toBe("hard_bounce");
    expect(emailStatusForBrevoEvent("unsubscribed")).toBe("unsubscribed");
    expect(emailStatusForBrevoEvent("spam")).toBe("complaint");
    for (const e of ["opened", "click", "deferred", "request", "unique_opened"]) expect(emailStatusForBrevoEvent(e)).toBeNull();
  });

  it("le statut de la fiche ne redescend jamais en gravité", () => {
    expect(mergeEmailStatus(null, "delivered")).toBe("delivered");
    expect(mergeEmailStatus("delivered", "hard_bounce")).toBe("hard_bounce");
    expect(mergeEmailStatus("hard_bounce", "delivered")).toBe("hard_bounce");
    expect(mergeEmailStatus("unsubscribed", "delivered")).toBe("unsubscribed");
    expect(mergeEmailStatus("unsubscribed", "complaint")).toBe("complaint");
    expect(mergeEmailStatus("soft_bounce", "delivered")).toBe("soft_bounce");
    expect(mergeEmailStatus("statut_inconnu", "delivered")).toBe("delivered");
  });

  it("seuls le bounce dur, la désinscription et la plainte arrêtent la séquence", () => {
    expect(stopReasonForEmailStatus("delivered")).toBeNull();
    expect(stopReasonForEmailStatus("soft_bounce")).toBeNull();
    expect(stopReasonForEmailStatus("hard_bounce")).toBe("bounce_dur");
    expect(stopReasonForEmailStatus("unsubscribed")).toBe("desinscription");
    expect(stopReasonForEmailStatus("complaint")).toBe("opposition");
  });

  it("écrit une ligne de journal lisible, avec le titre de l'e-mail et le motif", () => {
    const [ev] = parseBrevoWebhook(payload);
    const ligne = journalLineForBrevoEvent(ev, "hard_bounce", titreEmail(ev.leadEvent));
    expect(ligne.startsWith("[brevo-retour:hard_bounce]")).toBe(true);
    expect(ligne).toContain("Relance J+3, je n'arrive pas à vous joindre");
    expect(ligne).toContain("550 user unknown");
    expect(noteLisible(ligne)?.startsWith("« Relance J+3")).toBe(true);
    const sansTitre = journalLineForBrevoEvent({ ...ev, leadEvent: null }, "delivered", null);
    expect(sansTitre).toContain("l'e-mail automatique");
  });

  it("le journal masque les marques techniques et laisse les notes ordinaires intactes", () => {
    expect(noteLisible("[seq:etape:injoignable:j3] J+3 — e-mail de relance n°3 — e-mail envoyé.")).toBe("J+3 — e-mail de relance n°3 — e-mail envoyé.");
    expect(noteLisible("[twilio-retour:invalide] Numéro refusé par Twilio.")).toBe("Numéro refusé par Twilio.");
    expect(noteLisible("Rappelé, tombé sur la messagerie")).toBe("Rappelé, tombé sur la messagerie");
    expect(noteLisible("[brevo:poei_lead_nouveau] Email envoyé via Brevo.")).toBe("[brevo:poei_lead_nouveau] Email envoyé via Brevo."); // décodé ailleurs
    expect(noteLisible(null)).toBeNull();
    expect(noteLisible("[seq:fin:reponse]")).toBeNull();
  });

  it("chaque événement Brevo des séquences a un titre lisible", () => {
    for (const code of Object.values(BREVO_LEAD_EVENTS)) expect(titreEmail(code), code).toBeTruthy();
    expect(titreEmail("inconnu")).toBeNull();
  });
});

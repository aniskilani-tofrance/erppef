import { describe, expect, it } from "vitest";
import { FakeSupabase, asSupabase } from "../helpers/fake-supabase";
import { transitionForOutcome } from "@/lib/leads/sequences";
import { EVENT_OUTCOME_CODES, suggestedLeadStatus } from "@/lib/leads/status";
import { findLead, handleBrevoEvent } from "@/lib/leads/brevo-webhook-handler";
import type { BrevoWebhookEvent } from "@/lib/leads/brevo-webhook";

// Correctifs issus de l'audit du 30/09/2026 de la PR « séquences automatiques ».

const ORG = "a0000000-0000-4000-8000-000000000001";

function retour(over: Partial<BrevoWebhookEvent>): BrevoWebhookEvent {
  return { event: "hard_bounce", email: "karim@chezkarim.fr", messageId: null, leadNo: null, leadEvent: "poei_lead_relance_j3", reason: "mailbox not found", occurredAt: "2026-09-30T08:00:00.000Z", tags: [], raw: {}, ...over };
}

describe("réponse écrite du prospect", () => {
  it("« Réponse reçue » existe comme résultat et arrête la séquence comme un appel abouti", () => {
    expect(EVENT_OUTCOME_CODES).toContain("reponse_recue");
    expect(transitionForOutcome("email", "reponse_recue", "a_rappeler")).toEqual({ stop: "reponse" });
    expect(transitionForOutcome("whatsapp", "reponse_recue", "nurturing")).toEqual({ stop: "reponse" });
    expect(suggestedLeadStatus("reponse_recue", "a_rappeler")).toBe("contacte");
    expect(suggestedLeadStatus("reponse_recue", "gagne")).toBe("gagne"); // un statut final ne recule jamais
  });
});

describe("retour Brevo : fiche visée", () => {
  it("préfère une fiche encore ouverte à une fiche close plus récente pour la même adresse", async () => {
    const fake = new FakeSupabase();
    fake.seed("employer_leads", [
      { id: "11111111-1111-4111-8111-111111111111", org_id: ORG, lead_no: 1, company: "Chez Karim", email: "karim@chezkarim.fr", status: "a_rappeler", received_at: "2026-09-01T10:00:00.000Z", sequence_kind: "injoignable", sequence_step: "j3_email", sequence_next_at: "2026-10-02T08:00:00.000Z", email_status: null },
      { id: "22222222-2222-4222-8222-222222222222", org_id: ORG, lead_no: 2, company: "Chez Karim (doublon)", email: "karim@chezkarim.fr", status: "perdu", received_at: "2026-09-20T10:00:00.000Z", email_status: null },
    ]);
    const lead = await findLead(asSupabase(fake), ORG, retour({}));
    expect(lead?.lead_no).toBe(1);
  });

  it("le numéro de fiche de l'e-mail l'emporte sur l'adresse", async () => {
    const fake = new FakeSupabase();
    fake.seed("employer_leads", [
      { id: "11111111-1111-4111-8111-111111111111", org_id: ORG, lead_no: 1, email: "karim@chezkarim.fr", status: "a_rappeler", received_at: "2026-09-01T10:00:00.000Z" },
      { id: "33333333-3333-4333-8333-333333333333", org_id: ORG, lead_no: 3, email: "autre@chezkarim.fr", status: "nouveau", received_at: "2026-09-25T10:00:00.000Z" },
    ]);
    const lead = await findLead(asSupabase(fake), ORG, retour({ leadNo: 3 }));
    expect(lead?.lead_no).toBe(3);
  });

  it("un bounce dur marque la fiche, écrit le journal, arrête la séquence, et un rejeu du même retour est ignoré", async () => {
    const fake = new FakeSupabase(() => new Date("2026-09-30T08:05:00.000Z"));
    fake.seed("employer_leads", [
      { id: "11111111-1111-4111-8111-111111111111", org_id: ORG, lead_no: 1, company: "Chez Karim", contact_name: "Karim", email: "karim@chezkarim.fr", phone: "+33612345678", status: "a_rappeler", received_at: "2026-09-01T10:00:00.000Z", sequence_kind: "injoignable", sequence_step: "j3_email", sequence_started_at: "2026-09-27T08:00:00.000Z", sequence_next_at: "2026-10-02T08:00:00.000Z", email_status: null, opt_out_at: null },
    ]);
    const admin = asSupabase(fake);
    const ev = retour({ messageId: "<abc@smtp-relay.mailin.fr>" });

    const premier = await handleBrevoEvent(admin, ORG, ev);
    expect(premier).toMatchObject({ event: "hard_bounce", fiche: "L-0001", statut: "hard_bounce", arret: "bounce_dur" });
    const fiche = fake.lead("11111111-1111-4111-8111-111111111111");
    expect(fiche.email_status).toBe("hard_bounce");
    expect(fiche.sequence_next_at).toBeNull();
    expect(fiche.sequence_stop_reason).toBe("bounce_dur");
    expect(fake.rows("employer_lead_email_events")).toHaveLength(1);
    expect(fake.notesOf(fiche.id as string).join("\n")).toMatch(/bounce dur|Adresse invalide/i);

    const rejeu = await handleBrevoEvent(admin, ORG, ev);
    expect(rejeu).toEqual({ event: "hard_bounce", doublon: true });
    expect(fake.rows("employer_lead_email_events")).toHaveLength(1);
  });

  it("un retour sans fiche connue est conservé sans rien casser", async () => {
    const fake = new FakeSupabase();
    const res = await handleBrevoEvent(asSupabase(fake), ORG, retour({ email: "inconnu@nulle-part.fr" }));
    expect(res).toEqual({ event: "hard_bounce", fiche: null, retenu: true });
    expect(fake.rows("employer_lead_email_events")).toHaveLength(1);
    expect(fake.rows("employer_lead_email_events")[0].lead_id).toBeNull();
  });
});

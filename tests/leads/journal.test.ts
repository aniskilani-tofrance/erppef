import { describe, expect, it } from "vitest";
import { decrireMessage, estMessageAutomatique } from "@/lib/leads/journal";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/leads/templates";
import type { LeadForBrevo } from "@/lib/leads/brevo";

// Le journal doit rester lisible : un conseiller y lit une histoire, pas des marques
// techniques. Ces tests verrouillent la traduction des marques laissées par les envois.

const lead: LeadForBrevo = {
  id: "3c1f2e7a-1b2c-4d5e-8f90-1a2b3c4d5e6f",
  lead_no: 7,
  company: "Le Bistrot des Docks",
  contact_name: "Karim Benali",
  email: "karim@bistrotdesdocks.fr",
  phone: "+33612345678",
  city: "Saint-Ouen",
  postal_code: "93400",
  positions: "Commis de cuisine",
  positions_count: 2,
  segment: "traditionnel",
  status: "rdv_pris",
  rdv_at: "2026-09-23T08:00:00.000Z",
  rdv_mode: "sur_site",
};

describe("lecture du journal d'une fiche", () => {
  it("reconnaît une marque d'envoi automatique et laisse passer une note d'équipe", () => {
    expect(estMessageAutomatique("[brevo:poei_lead_nouveau] Email envoyé via Brevo (<id@x>).")).toBe(true);
    expect(estMessageAutomatique("Rappelé, tombé sur la messagerie")).toBe(false);
    expect(estMessageAutomatique(null)).toBe(false);
  });

  it("traduit un e-mail envoyé en titre lisible, avec son objet et son corps", () => {
    const m = decrireMessage("[brevo:poei_lead_nouveau] Email envoyé via Brevo (<id@x>).", lead, DEFAULT_LEAD_SETTINGS);
    expect(m).toBeTruthy();
    expect(m!.canal).toBe("email");
    expect(m!.etat).toBe("envoye");
    expect(m!.titre).toBe("Demande de recrutement prise en compte");
    expect(m!.sujet).toContain("Le Bistrot des Docks");
    expect(m!.corps).toContain("Karim");
  });

  it("distingue un rappel programmé et retient sa date d'envoi", () => {
    const note = "[brevo:poei_lead_rappel_rdv] Email programmé via Brevo pour 2026-09-22T08:00:00.000Z (batch).";
    const m = decrireMessage(note, lead, DEFAULT_LEAD_SETTINGS);
    expect(m!.etat).toBe("programme");
    expect(m!.quand).toBe("2026-09-22T08:00:00.000Z");
    expect(m!.titre).toBe("Rappel du rendez-vous, la veille");
  });

  it("traduit un SMS envoyé et restitue son texte exact", () => {
    const m = decrireMessage("[twilio:demande_recue] SMS envoyé via Twilio (SM123).", lead, DEFAULT_LEAD_SETTINGS);
    expect(m!.canal).toBe("sms");
    expect(m!.sujet).toBeNull();
    expect(m!.corps).toContain("Le Bistrot des Docks");
    expect(m!.corps).toContain(DEFAULT_LEAD_SETTINGS.calendlyUrl);
  });

  it("ne décode pas une note ordinaire ni une marque inconnue", () => {
    expect(decrireMessage("Rappelé, il rappelle demain", lead, DEFAULT_LEAD_SETTINGS)).toBeNull();
    expect(decrireMessage("[brevo:evenement_inexistant] ...", lead, DEFAULT_LEAD_SETTINGS)).toBeNull();
  });
});

describe("confirmation de l'appel de qualification", () => {
  it("porte le créneau, le cadre de l'échange et une porte de sortie", () => {
    const m = decrireMessage(
      "[brevo:poei_lead_qualification_confirmee] Email envoyé via Brevo (<id@x>).",
      lead,
      DEFAULT_LEAD_SETTINGS,
    );
    expect(m).toBeTruthy();
    expect(m!.titre).toBe("Confirmation de l'appel de qualification");
    expect(m!.sujet).toContain("réservé");
    expect(m!.corps).toContain("quinze minutes");
    expect(m!.corps).toContain("Le Bistrot des Docks");
    expect(m!.corps).toContain("lien de modification");
    expect(m!.corps).not.toContain("Anis");
  });
});

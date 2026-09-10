import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_SETTINGS, leadVars, mailtoLink, renderEmail, renderSms, resolveLeadSettings, smsLink, telLink } from "@/lib/leads/templates";

const lead = { company: "Chez Karim", contact_name: "Karim Benali", positions: "commis de cuisine", rdv_at: "2026-09-18T13:00:00Z", rdv_mode: "sur_site" };

describe("modèles SMS / email restauration", () => {
  it("SMS après appel manqué : prénom, parlerresto, 0 € de reste à charge, jamais « gratuit »", () => {
    const sms = renderSms("appel_manque", leadVars(lead, DEFAULT_LEAD_SETTINGS, "Shahzad"));
    expect(sms.startsWith("Bonjour Karim, Shahzad de ParlerEmploi.")).toBe(true);
    expect(sms).toContain("0 € de reste à charge");
    expect(sms).not.toMatch(/gratuit/i);
  });
  it("SMS de rappel de RDV : jour, heure et mode en heure de Paris", () => {
    const sms = renderSms("rappel_rdv", leadVars(lead, DEFAULT_LEAD_SETTINGS, "Shahzad"));
    expect(sms).toContain("vendredi 18 septembre à 15h dans votre restaurant");
    expect(sms).toContain("Anis Kilani");
  });
  it("email de confirmation : objet et corps remplis, prochain groupe et Calendly des réglages", () => {
    const settings = resolveLeadSettings({ leads: { nextGroupLabel: "le 2 novembre", slot1: "lundi 10h" } });
    const mail = renderEmail("documentation", leadVars(lead, settings, "Shahzad"));
    expect(mail.subject).toBe("Chez Karim — recruter en commis de cuisine avec un candidat formé chez vous (comme convenu)");
    expect(mail.body).toContain("démarre le 2 novembre");
    expect(mail.body).toContain(DEFAULT_LEAD_SETTINGS.calendlyUrl);
  });
  it("sans prénom : « Bonjour, »", () => {
    const sms = renderSms("creneau_promis", leadVars({ ...lead, contact_name: null, rdv_at: null, rdv_mode: null }, DEFAULT_LEAD_SETTINGS, "Shahzad"));
    expect(sms.startsWith("Bonjour, comme convenu")).toBe(true);
  });
  it("liens un tap", () => {
    expect(telLink("06 12 34 56 78")).toBe("tel:+33612345678");
    expect(smsLink("06 12 34 56 78", "Bonjour")).toBe("sms:+33612345678?&body=Bonjour");
    expect(mailtoLink("k@x.fr", "Objet", "Corps")).toBe("mailto:k@x.fr?subject=Objet&body=Corps");
    expect(mailtoLink("pas un email", "a", "b")).toBeNull();
  });
});

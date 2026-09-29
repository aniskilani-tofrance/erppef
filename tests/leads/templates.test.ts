import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_SETTINGS,
  directorCalendlyLink,
  formatSetterPhone,
  MANUAL_SMS_TEMPLATES,
  leadVars,
  mailtoLink,
  renderEmail,
  renderSms,
  resolveLeadSettings,
  smsLink,
  telLink,
} from "@/lib/leads/templates";

const lead = { company: "Chez Karim", contact_name: "Karim Benali", positions: "commis de cuisine", rdv_at: "2026-09-18T13:00:00Z", rdv_mode: "sur_site" };

describe("téléphone du setter dans les messages", () => {
  const withPhone = resolveLeadSettings({ leads: { setterPhone: "0759119097" } });

  it("met en forme le numéro saisi sous toutes ses formes", () => {
    expect(formatSetterPhone("0759119097")).toBe("07 59 11 90 97");
    expect(formatSetterPhone("+33 7 59 11 90 97")).toBe("07 59 11 90 97");
    expect(formatSetterPhone("33759119097")).toBe("07 59 11 90 97");
    expect(formatSetterPhone("  ")).toBe("");
    expect(formatSetterPhone("01 23")).toBe("01 23");
  });

  it("annonce le numéro quand un appel est promis ou vient d'être tenté", () => {
    const vars = leadVars(lead, withPhone, null);
    expect(renderSms("demande_recue", vars)).toContain("30min. Un conseiller vous appellera depuis le 07 59 11 90 97, enregistrez ce numéro. ParlerEmploi");
    expect(renderSms("qualification_reservee", vars)).toContain("au numéro indiqué. L'appel viendra du 07 59 11 90 97 : enregistrez ce numéro. À très vite");
    expect(renderSms("appel_manque", vars)).toContain("pour Chez Karim. Vous pouvez aussi nous rappeler entre deux services au 07 59 11 90 97. Pour éviter");
    expect(renderSms("creneau_promis", vars)).toMatch(/en dehors du service\. L'appel viendra du 07 59 11 90 97 : enregistrez ce numéro\.$/);
    expect(renderEmail("relance_j3", vars).body).toContain("entre deux services.\nVous pouvez aussi nous rappeler entre deux services au 07 59 11 90 97.\n\nL'équipe");
    expect(renderEmail("reponse_ecrite", vars).body).toContain("rappeler entre deux services au 07 59 11 90 97.");
  });

  it("sans réglage, les phrases restent correctes et aucune ligne vide ne traîne", () => {
    const vars = leadVars(lead, DEFAULT_LEAD_SETTINGS, null);
    expect(renderSms("demande_recue", vars)).toContain("30min. ParlerEmploi");
    expect(renderSms("qualification_reservee", vars)).toContain("Nous vous appellerons au numéro indiqué. À très vite");
    expect(renderSms("appel_manque", vars)).toContain("pour Chez Karim. Pour éviter");
    expect(renderSms("creneau_promis", vars)).toMatch(/en dehors du service\.$/);
    const relance = renderEmail("relance_j3", vars).body;
    expect(relance).not.toMatch(/rappeler entre deux services/);
    expect(relance).toContain("entre deux services.\n\nL'équipe conseil ParlerEmploi");
    for (const sms of ["demande_recue", "qualification_reservee", "appel_manque", "creneau_promis"] as const) {
      expect(renderSms(sms, vars)).not.toMatch(/ [.,]| {2,}/);
    }
  });

  it("le numéro du setter reste hors des messages de rendez-vous avec la direction", () => {
    const vars = leadVars(lead, withPhone, null);
    expect(renderSms("confirmation_rdv", vars)).not.toContain("07 59");
    expect(renderSms("rappel_rdv", vars)).not.toContain("07 59");
    expect(renderEmail("no_show", vars).body).not.toContain("07 59");
  });
});

describe("modèles SMS / email restauration", () => {
  it("SMS après appel manqué : marque, Calendly et aucun prénom d'équipe exposé", () => {
    const sms = renderSms("appel_manque", leadVars(lead, DEFAULT_LEAD_SETTINGS, "Shahzad"));
    expect(sms.startsWith("Bonjour Karim, ParlerEmploi")).toBe(true);
    expect(sms).toContain(DEFAULT_LEAD_SETTINGS.calendlyUrl);
    expect(sms).not.toMatch(/shahzad|anis|gratuit/i);
  });

  it("SMS de rappel de RDV : jour, heure, mode et expert ParlerEmploi", () => {
    const sms = renderSms("rappel_rdv", leadVars(lead, DEFAULT_LEAD_SETTINGS, "Shahzad"));
    expect(sms).toContain("vendredi 18 septembre à 15h dans votre restaurant");
    expect(sms).toContain("expert ParlerEmploi");
    expect(sms).not.toMatch(/shahzad|anis/i);
  });

  it("SMS automatiques : demande, réservation Calendly et rendez-vous confirmé", () => {
    const vars = leadVars(lead, DEFAULT_LEAD_SETTINGS, null);
    expect(renderSms("demande_recue", vars)).toContain("votre besoin de recrutement pour Chez Karim");
    expect(renderSms("qualification_reservee", vars)).toContain("vendredi 18 septembre à 15h");
    expect(renderSms("confirmation_rdv", vars)).toContain("votre rendez-vous ParlerEmploi est confirmé");
  });

  it("seul le rappel de créneau convenu reste disponible manuellement", () => {
    expect(MANUAL_SMS_TEMPLATES.map((template) => template.code)).toEqual(["creneau_promis"]);
  });

  it("email de confirmation : objet et corps remplis, prochain groupe et Calendly des réglages", () => {
    const settings = resolveLeadSettings({ leads: { nextGroupLabel: "le 2 novembre", slot1: "lundi 10h" } });
    const mail = renderEmail("documentation", leadVars(lead, settings, "Shahzad"));
    expect(mail.subject).toBe("Chez Karim — recruter en commis de cuisine avec un candidat formé chez vous (comme convenu)");
    expect(mail.body).toContain("démarre le 2 novembre");
    expect(mail.body).toContain(DEFAULT_LEAD_SETTINGS.calendlyUrl);
  });

  it("préremplit le Calendly de direction sans détourner le lien de qualification", () => {
    const url = directorCalendlyLink(
      { contact_name: "Karim Benali", email: "karim@chezkarim.fr" },
      DEFAULT_LEAD_SETTINGS,
    );
    expect(url).toContain("anis-kilani-parleremploi/nouvelle-reunion");
    expect(url).toContain("name=Karim+Benali");
    expect(url).toContain("email=karim%40chezkarim.fr");
    expect(DEFAULT_LEAD_SETTINGS.calendlyUrl).toContain("contact-parleremploi/30min");
  });

  it("propose une reprogrammation préremplie après un rendez-vous manqué", () => {
    const mail = renderEmail("no_show", leadVars({ ...lead, email: "karim@chezkarim.fr" }, DEFAULT_LEAD_SETTINGS, null));
    expect(mail.subject).toContain("Karim");
    expect(mail.subject).toContain("Chez Karim");
    expect(mail.body).toContain("anis-kilani-parleremploi/nouvelle-reunion");
    expect(mail.body).toContain("name=Karim+Benali");
    expect(mail.body).toContain("email=karim%40chezkarim.fr");
    expect(mail.body).not.toMatch(/inscription|setter|closer/i);
  });

  it("cadre les relances après rendez-vous autour d'une réponse simple", () => {
    const vars = leadVars({ ...lead, email: "karim@chezkarim.fr" }, DEFAULT_LEAD_SETTINGS, null);
    const recap = renderEmail("post_rdv_recap", vars);
    const j2 = renderEmail("post_rdv_j2", vars);
    const j7 = renderEmail("post_rdv_j7", vars);
    expect(recap.body).toContain("validé");
    expect(j2.body).toContain("on avance");
    expect(j7.body).toContain("ne pas vous relancer inutilement");
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

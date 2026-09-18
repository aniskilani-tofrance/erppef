// Lecture du journal d'une fiche lead.
//
// Les envois automatiques laissent dans `employer_lead_events.note` une marque technique
// — `[brevo:poei_lead_nouveau]`, `[twilio:demande_recue]` — qui sert à ne jamais envoyer
// deux fois le même message. Utile pour la machine, illisible pour un conseiller. Ce
// module traduit ces marques en langage clair et retrouve le message correspondant.

import { BREVO_LEAD_EVENTS, brevoMessageFor, type BrevoLeadEvent, type LeadForBrevo } from "@/lib/leads/brevo";
import { SMS_TEMPLATES, leadVars, renderSms, type LeadSettings, type SmsTemplateCode } from "@/lib/leads/templates";

export type JournalMessage = {
  canal: "email" | "sms";
  /** « envoyé » ou « programmé pour le … » */
  etat: "envoye" | "programme";
  titre: string;
  quand: string | null; // date d'envoi prévue, pour un message programmé
  sujet: string | null; // e-mails seulement
  corps: string;
};

const TITRE_EMAIL: Record<string, string> = {
  [BREVO_LEAD_EVENTS.nouveau]: "Demande de recrutement prise en compte",
  [BREVO_LEAD_EVENTS.aRappeler]: "Quel créneau pour avancer ?",
  [BREVO_LEAD_EVENTS.rdvPris]: "Confirmation du rendez-vous",
  [BREVO_LEAD_EVENTS.rappelRdv]: "Rappel du rendez-vous, la veille",
  [BREVO_LEAD_EVENTS.rappelRdvH2]: "Rappel du rendez-vous, deux heures avant",
  [BREVO_LEAD_EVENTS.rappelQualificationJ1]: "Rappel de l'appel de qualification, la veille",
  [BREVO_LEAD_EVENTS.rappelQualificationH2]: "Rappel de l'appel de qualification, deux heures avant",
  [BREVO_LEAD_EVENTS.noShow]: "Après un rendez-vous manqué",
  [BREVO_LEAD_EVENTS.dernierMessage]: "Clôture du dossier",
};

const TITRE_SMS = new Map(SMS_TEMPLATES.map((t) => [t.code as string, t.label.replace(/^SMS (n°\d+ )?— /, "")]));

const MARQUE = /^\[(brevo|twilio):([a-z0-9_]+)\]\s*(.*)$/i;
const PROGRAMME_LE = /programmé via Brevo pour (\S+)/i;

/** Rien à décoder : la note est une note d'équipe ordinaire. */
export function estMessageAutomatique(note: string | null | undefined): boolean {
  return MARQUE.test((note ?? "").trim());
}

/**
 * Traduit une ligne de journal en message lisible. Le corps est reconstitué à partir
 * du modèle et des informations ACTUELLES de la fiche : si le rendez-vous a été déplacé
 * depuis, l'aperçu montre le nouvel horaire, pas celui du jour de l'envoi.
 */
export function decrireMessage(
  note: string | null | undefined,
  lead: LeadForBrevo,
  settings: LeadSettings,
): JournalMessage | null {
  const m = MARQUE.exec((note ?? "").trim());
  if (!m) return null;
  const [, fournisseur, code, reste] = m;

  if (fournisseur.toLowerCase() === "twilio") {
    if (!TITRE_SMS.has(code)) return null;
    return {
      canal: "sms",
      etat: "envoye",
      titre: TITRE_SMS.get(code)!,
      quand: null,
      sujet: null,
      corps: renderSms(code as SmsTemplateCode, leadVars(lead, settings, "Un conseiller ParlerEmploi")),
    };
  }

  const titre = TITRE_EMAIL[code];
  if (!titre) return null;
  const message = brevoMessageFor(code as BrevoLeadEvent, lead, settings);
  const programme = PROGRAMME_LE.exec(reste);
  return {
    canal: "email",
    etat: programme ? "programme" : "envoye",
    titre,
    quand: programme ? programme[1] : null,
    sujet: message.subject,
    corps: message.body,
  };
}

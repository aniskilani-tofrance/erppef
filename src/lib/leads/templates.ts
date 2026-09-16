// Modèles SMS et emails du kit Shahzad v3 (doc 2️⃣ « Templates emails & SMS · RESTAURATION »).
// Les mots de la campagne parlerresto sont repris tels quels : « formé directement dans
// votre restaurant », « 3 jours chez vous / 2 jours chez nous », « 0 € de reste à charge
// sur la formation ». Jamais « 100 % gratuit », jamais « aucun engagement ».
//
// Variables : {prenom} {restaurant} {metier} {jour} {heure} {mode} {date_groupe}
// {calendly} {setter} {direction} {creneau1} {creneau2}

import { renderTemplate } from "@/lib/admission/templates";
import { toWhatsAppNumber } from "@/lib/admission/phone";

export type LeadSettings = {
  nextGroupLabel: string; // « le 2 novembre » — la date du prochain groupe restauration
  calendlyUrl: string; // qualification prospect
  directorCalendlyUrl: string; // rendez-vous direction après qualification
  slot1: string; // « mardi 10h »
  slot2: string; // « jeudi 15h »
  directorName: string; // « Anis Kilani »
  inboundToken: string; // jeton du webhook /api/leads/inbound (vide = webhook fermé)
  notifyEmail: string; // email prévenu à chaque nouveau lead (le setter)
  defaultOwnerUserId: string; // à qui attribuer les leads entrants
};

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  nextGroupLabel: "[date à fixer]",
  calendlyUrl: "https://calendly.com/contact-parleremploi/30min",
  directorCalendlyUrl: "https://calendly.com/anis-kilani-parleremploi/nouvelle-reunion",
  slot1: "mardi 10h",
  slot2: "jeudi 15h",
  directorName: "Anis Kilani",
  inboundToken: "",
  notifyEmail: "",
  defaultOwnerUserId: "",
};

// Réglages effectifs = défauts + retouches de l'organisme (organizations.settings.leads)
export function resolveLeadSettings(settings: unknown): LeadSettings {
  const raw = (settings as { leads?: Record<string, unknown> } | null)?.leads ?? {};
  const out = { ...DEFAULT_LEAD_SETTINGS };
  for (const key of Object.keys(out) as (keyof LeadSettings)[]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

export const SMS_TEMPLATES = [
  {
    code: "demande_recue",
    delivery: "automatic",
    label: "SMS — demande de recrutement prise en compte",
    when: "Immédiatement après le formulaire, pendant la plage d'envoi autorisée.",
    text: `Bonjour {prenom}, votre besoin de recrutement pour {restaurant} est bien pris en compte. Pour avancer sans vous déranger pendant le service, choisissez votre créneau ici : {calendly}. ParlerEmploi`,
  },
  {
    code: "qualification_reservee",
    delivery: "automatic",
    label: "SMS — appel de qualification réservé",
    when: "Dès qu'un créneau Calendly de qualification est confirmé.",
    text: `Bonjour {prenom}, votre appel de qualification ParlerEmploi est réservé {jour} à {heure}. Nous vous appellerons au numéro indiqué. À très vite pour avancer sur les recrutements de {restaurant}.`,
  },
  {
    code: "confirmation_rdv",
    delivery: "automatic",
    label: "SMS — rendez-vous avec un expert confirmé",
    when: "Dès que le rendez-vous avec un expert ParlerEmploi est posé.",
    text: `Bonjour {prenom}, votre rendez-vous ParlerEmploi est confirmé {jour} à {heure} {mode}, au sujet des recrutements de {restaurant}. En cas d'empêchement, répondez à ce SMS.`,
  },
  {
    code: "appel_manque",
    delivery: "automatic",
    label: "SMS n°1 — après appel manqué (J0)",
    when: "Systématique après un message vocal.",
    text: `Bonjour {prenom}, ParlerEmploi vous a appelé au sujet de votre demande pour {restaurant}. Pour éviter de vous déranger pendant le service, indiquez-nous votre meilleur créneau ou réservez ici : {calendly}.`,
  },
  {
    code: "derniere_tentative",
    delivery: "automatic",
    label: "SMS n°2 — dernière tentative (J6)",
    when: "Après le 4e essai sans réponse.",
    text: `Bonjour {prenom}, sans retour de votre part nous allons clôturer le suivi de votre demande pour {restaurant}. Si votre besoin en {metier} est toujours d'actualité, choisissez un créneau ici : {calendly}. ParlerEmploi`,
  },
  {
    code: "rappel_rdv",
    delivery: "automatic",
    label: "SMS n°3 — rappel de RDV (la veille)",
    when: "Obligatoire la veille de chaque rendez-vous.",
    text: `Bonjour {prenom}, rappel de votre rendez-vous demain {jour} à {heure} {mode} avec un expert ParlerEmploi, au sujet de vos recrutements en {metier}. À demain !`,
  },
  {
    code: "creneau_promis",
    delivery: "manual",
    label: "SMS n°4 — rappel de créneau promis",
    when: "Le jour même, avant de rappeler à l'heure convenue.",
    text: `Bonjour {prenom}, comme convenu, un conseiller ParlerEmploi vous appelle aujourd'hui à {heure}, en dehors du service.`,
  },
  {
    code: "no_show",
    delivery: "automatic",
    label: "SMS — après un RDV manqué",
    when: "Le jour du no-show, avec l'email n°6.",
    text: `Bonjour {prenom}, nous avons manqué notre rendez-vous. Préférez-vous le recaler {creneau1} ou {creneau2} ? ParlerEmploi`,
  },
] as const;
export type SmsTemplateCode = (typeof SMS_TEMPLATES)[number]["code"];
export const SMS_TEMPLATE_CODES = SMS_TEMPLATES.map((template) => template.code) as [SmsTemplateCode, ...SmsTemplateCode[]];
export const MANUAL_SMS_TEMPLATE_CODES = ["creneau_promis"] as const;
export type ManualSmsTemplateCode = (typeof MANUAL_SMS_TEMPLATE_CODES)[number];
export const MANUAL_SMS_TEMPLATES = SMS_TEMPLATES.filter(
  (template): template is Extract<(typeof SMS_TEMPLATES)[number], { code: ManualSmsTemplateCode }> =>
    (MANUAL_SMS_TEMPLATE_CODES as readonly string[]).includes(template.code),
);

export const EMAIL_TEMPLATES = [
  {
    code: "confirmation_rdv",
    label: "Email n°1 — confirmation de RDV",
    when: "Immédiatement après l'appel où le RDV est posé.",
    subject: `Votre rendez-vous est confirmé — {restaurant} · {jour} à {heure}`,
    text: `Bonjour {prenom},

Votre rendez-vous concernant les recrutements de {restaurant} est confirmé :

▶ {jour} à {heure} — {mode}

Un expert ParlerEmploi préparera cet échange à partir des éléments déjà partagés : votre besoin en {metier}, le rythme de l'établissement, les profils recherchés et la faisabilité du parcours.

D'ici là, si votre organisation change, répondez directement à ce message ou déplacez le créneau ici : {calendly}

L'équipe conseil ParlerEmploi
Recrutement & formation restauration`,
  },
  {
    code: "documentation",
    label: "Email n°2 — « voici la documentation »",
    when: "Après un appel où le restaurateur a demandé une doc.",
    subject: `{restaurant} — recruter en {metier} avec un candidat formé chez vous (comme convenu)`,
    text: `Bonjour {prenom},

Comme convenu au téléphone, voici l'essentiel en 4 points :

1. Vous cherchez à recruter en {metier} : nous vous présentons des candidats motivés, inscrits à France Travail, sélectionnés dans notre vivier — avec une expérience ou un vrai projet en restauration.

2. Le parcours dure 3 mois : 3 jours par semaine dans votre restaurant (votre carte, votre rythme, vos méthodes, avec votre chef ou votre manager) et 2 jours par semaine dans notre centre de Saint-Ouen (hygiène et HACCP, relation client, français du service, savoir-être).

3. France Travail finance la formation (dispositif POEI, jusqu'à 450 h) : 0 € de reste à charge sur la formation, et une indemnité de tutorat pour les heures d'immersion chez vous.

4. Vous n'embauchez qu'à la fin, si le candidat a le niveau — 85 % des POEI se concluent par une embauche.

Notre prochain groupe restauration démarre {date_groupe} : pour en profiter, le poste doit être défini dans les prochaines semaines.

▶ Un échange hors service avec un expert ParlerEmploi pour étudier votre cas : {calendly} — ou répondez à ce message avec vos disponibilités.

L'équipe conseil ParlerEmploi
Organisme certifié Qualiopi`,
  },
  {
    code: "relance_j3",
    label: "Email n°3 — relance J3 (injoignable)",
    when: "Troisième tentative, par écrit.",
    subject: `Votre demande sur parlerresto — je n'arrive pas à vous joindre`,
    text: `Bonjour {prenom},

Vous avez laissé vos coordonnées sur parlerresto au sujet d'un employé formé directement dans votre restaurant, et je n'ai pas réussi à vous joindre — j'imagine que je tombe en plein service.

En bref : vous recrutez en cuisine ou en salle, France Travail peut financer la formation du candidat avant l'embauche, sous réserve de l'éligibilité du projet. Le parcours est construit autour de votre établissement, avec 3 jours sur site et 2 jours au centre.

Le plus simple : choisissez un créneau de 15 min hors service ici → {calendly}
Ou indiquez-moi à quelle heure vous appeler entre deux services.

L'équipe conseil ParlerEmploi`,
  },
  {
    code: "rupture_j10",
    label: "Email n°4 — rupture J10 « je ferme votre dossier ? »",
    when: "Dernière cartouche, souvent la plus efficace.",
    subject: `Je ferme votre dossier ?`,
    text: `Bonjour {prenom},

Sans retour de votre part après plusieurs tentatives, je m'apprête à classer votre demande — je préfère vérifier avant :

– Si vos recrutements ne sont plus d'actualité : aucun souci, un simple « stop » me suffit.
– Si c'est juste un problème de timing (la saison, un coup de feu) : dites-moi quand revenir vers vous.
– Si vous cherchez toujours en cuisine ou en salle : le prochain groupe restauration démarre {date_groupe}, il reste des places → {calendly}

L'équipe conseil ParlerEmploi`,
  },
  {
    code: "reponse_ecrite",
    label: "Email n°5 — réponse à un lead qui écrit",
    when: "Quand le restaurateur répond par email au lieu d'appeler.",
    subject: `Vos recrutements en restauration — un échange de 5 minutes ?`,
    text: `Bonjour {prenom},

Merci pour votre message. Pour vous répondre précisément (postes, calendrier, profil), le plus efficace est un échange de 5 minutes : je peux vous appeler aujourd'hui en dehors du service — quel créneau vous arrange ?

En attendant, l'essentiel : France Travail finance la formation de vos futures recrues AVANT l'embauche (3 jours chez vous / 2 jours chez nous pendant 3 mois, 0 € de reste à charge sur la formation), nous fournissons les candidats et la formation, vous n'embauchez qu'à la fin si le niveau est atteint.

L'équipe conseil ParlerEmploi`,
  },
  {
    code: "no_show",
    label: "Email n°6 — après un RDV manqué",
    when: "Le jour du no-show, sans culpabiliser.",
    subject: `On s'est manqués — on recale ?`,
    text: `Bonjour {prenom},

Nous avons manqué notre rendez-vous du {jour} à {heure} — un coup de feu, un fournisseur, cela arrive à tout le monde en restauration.

Nous vous proposons de le recaler hors service : {creneau1} ou {creneau2} ? Ou directement ici : {calendly}

Si entre-temps le besoin a changé, dites-le-moi en une ligne.

L'équipe conseil ParlerEmploi`,
  },
] as const;
export type EmailTemplateCode = (typeof EMAIL_TEMPLATES)[number]["code"];

export type LeadVars = Partial<Record<
  "prenom" | "restaurant" | "metier" | "jour" | "heure" | "mode" | "date_groupe" | "calendly" | "setter" | "direction" | "creneau1" | "creneau2",
  string | null | undefined
>>;

export type LeadForVars = {
  company: string;
  contact_name: string | null;
  positions: string | null;
  rdv_at: string | null;
  rdv_mode: string | null;
};

// Prénom = premier mot du contact (« Karim Benali » → « Karim »). Un nom en MAJUSCULES seul reste tel quel.
export function firstNameOf(contactName: string | null | undefined): string | null {
  const name = contactName?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0];
}

function fmtRdvDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}
function fmtRdvTime(iso: string): string {
  const [h, m] = new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}
function rdvModeText(mode: string | null): string {
  switch (mode) {
    case "sur_site":
      return "dans votre restaurant";
    case "visio":
      return "en visio";
    case "telephone":
      return "par téléphone";
    default:
      return "";
  }
}

export function leadVars(lead: LeadForVars, settings: LeadSettings, setterFirstName: string | null | undefined): LeadVars {
  return {
    prenom: firstNameOf(lead.contact_name),
    restaurant: lead.company,
    metier: lead.positions?.trim() || "cuisine ou salle",
    jour: lead.rdv_at ? fmtRdvDay(lead.rdv_at) : null,
    heure: lead.rdv_at ? fmtRdvTime(lead.rdv_at) : null,
    mode: rdvModeText(lead.rdv_mode),
    date_groupe: settings.nextGroupLabel,
    calendly: settings.calendlyUrl,
    setter: setterFirstName?.trim() || "L'équipe",
    direction: settings.directorName,
    creneau1: settings.slot1,
    creneau2: settings.slot2,
  };
}

/**
 * Opens the direction's booking page from a CRM lead while keeping the
 * prospect's visible form limited to Calendly. Name and email are the two
 * documented universal prefill fields; the telephone remains in the CRM.
 */
export function directorCalendlyLink(
  lead: Pick<LeadForVars, "contact_name"> & { email?: string | null },
  settings: LeadSettings,
): string {
  try {
    const url = new URL(settings.directorCalendlyUrl);
    const name = lead.contact_name?.trim();
    const email = lead.email?.trim();
    if (name) url.searchParams.set("name", name);
    if (email?.includes("@")) url.searchParams.set("email", email);
    return url.toString();
  } catch {
    return settings.directorCalendlyUrl;
  }
}

export function renderSms(code: SmsTemplateCode, vars: LeadVars): string {
  const tpl = SMS_TEMPLATES.find((t) => t.code === code)!;
  return renderTemplate(tpl.text, vars);
}

export function renderEmail(code: EmailTemplateCode, vars: LeadVars): { subject: string; body: string } {
  const tpl = EMAIL_TEMPLATES.find((t) => t.code === code)!;
  return { subject: renderTemplate(tpl.subject, vars).replace(/\s+/g, " ").trim(), body: renderTemplate(tpl.text, vars) };
}

// ── Liens « un tap » depuis le téléphone ──────────────────────────────────────
// tel: appelle ; sms:?&body= pré-remplit le SMS (le « ?& » marche sur iOS et Android) ;
// mailto: ouvre le mail pré-rempli ; wa.me ouvre WhatsApp. Aucune API, aucun coût.
export function telLink(phone: string | null | undefined): string | null {
  const n = toWhatsAppNumber(phone);
  return n ? `tel:+${n}` : null;
}
export function smsLink(phone: string | null | undefined, body: string): string | null {
  const n = toWhatsAppNumber(phone);
  return n ? `sms:+${n}?&body=${encodeURIComponent(body)}` : null;
}
export function mailtoLink(email: string | null | undefined, subject: string, body: string): string | null {
  const e = email?.trim();
  if (!e || !e.includes("@")) return null;
  return `mailto:${e}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

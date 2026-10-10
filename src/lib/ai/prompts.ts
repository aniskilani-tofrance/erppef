import { z } from "zod";

// Prompts et schémas de l'assistant : PURS (aucun accès base, aucun appel réseau), testables.
// Chaque fonction rend { system, user, schema }. Les données passées sont déjà minimisées
// (prénom, référence, niveau, dates) ; jamais de coordonnées ni de champ sensible.

export const ORG = "Parler Emploi Formation";

const BASE_RULES = `Tu assistes la coordinatrice d'une association de cours de français (FLE) à Saint-Ouen, ${ORG}.
Les apprenants sont des adultes allophones en insertion : tu écris en français SIMPLE (phrases courtes, vouvoiement, mots courants, pas de jargon administratif), ton chaleureux et respectueux, jamais culpabilisant.
Tu proposes, l'équipe décide : tu n'inventes jamais une date, un lieu, un niveau ou un fait absent des données fournies. Si une information manque, tu le dis au lieu de la deviner.`;

export function todayLabel(now = new Date()): string {
  return now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Langue déclarée en texte libre (« Ar », « espagnole », « arabe égyptien - un peu anglais ») :
// on la transmet telle quelle ; le modèle décide s'il traduit (jamais pour le français).
function languageNote(language: string | null | undefined): string {
  const l = language?.trim();
  if (!l || /^fr/i.test(l) || /fran[cç]ais/i.test(l)) return "Langue maternelle : français ou inconnue → pas de traduction (translation = null).";
  return `Langue maternelle déclarée : « ${l} » → ajoute une traduction fidèle dans cette langue (translation), registre poli, prénom conservé. Si tu ne reconnais pas la langue, translation = null.`;
}

// 1. Message au groupe : annulation, report, remplacement ──────────────────────────────
export const BroadcastSchema = z.object({
  fr: z.string().describe("Le message en français simple, prêt à envoyer sur WhatsApp, signé du prénom de l'expéditeur"),
  translations: z.array(z.object({ language: z.string(), text: z.string() })).describe("Une traduction par langue demandée (texte complet), vide si aucune langue"),
});
export function groupBroadcastPrompt(input: {
  kind: "annulation" | "report" | "remplacement" | "information";
  groupName: string;
  sessionWhen: string | null; // « mardi 14 octobre de 13h à 16h »
  newWhen: string | null;
  place: string | null;
  replacementTrainer: string | null;
  details: string | null;
  senderFirstName: string | null;
  languages: string[]; // langues maternelles distinctes des inscrits (hors français)
}) {
  const kindText = {
    annulation: "la séance est ANNULÉE (pas de cours ce jour-là)",
    report: "la séance est DÉPLACÉE à une nouvelle date/heure",
    remplacement: "la formatrice habituelle est absente, une autre personne assure le cours",
    information: "une information pratique à transmettre au groupe",
  }[input.kind];
  return {
    system: `${BASE_RULES}
Tu rédiges un message WhatsApp pour TOUS les apprenants d'un groupe. Structure : salutation collective (« Bonjour à tous, »), le fait en une phrase, les éléments pratiques sur des lignes séparées avec 📅 et 📍 quand ils existent, une phrase de clôture (« Merci de confirmer que vous avez bien lu », ou l'instruction donnée), signature par le prénom (ou « L'équipe ${ORG} »).
Pour chaque langue listée, fournis une traduction complète et fidèle du même message. Jamais d'emoji autre que 📅 📍.`,
    user: `Groupe : ${input.groupName}
Nature : ${kindText}
Séance concernée : ${input.sessionWhen ?? "non précisée"}
Nouvelle date/heure : ${input.newWhen ?? "aucune"}
Lieu : ${input.place ?? "inchangé / non précisé"}
Remplaçant(e) : ${input.replacementTrainer ?? "aucun"}
Précisions de la coordinatrice : ${input.details ?? "aucune"}
Expéditeur : ${input.senderFirstName ?? "l'équipe"}
Langues à traduire : ${input.languages.length ? input.languages.join(", ") : "aucune"}`,
    schema: BroadcastSchema,
  };
}

// 2. Relance d'absence personnalisée ────────────────────────────────────────────────
export const FollowupSchema = z.object({
  fr: z.string().describe("Le message WhatsApp en français simple, signé"),
  translation: z.string().nullable().describe("Traduction dans la langue maternelle, ou null"),
  tone: z.string().describe("En 5 mots : le ton choisi et pourquoi (pour la coordinatrice)"),
});
export function absenceFollowupPrompt(input: {
  firstName: string;
  language: string | null;
  groupName: string;
  missedWhen: string; // « mardi 7 octobre »
  streak: number;
  presentCount: number;
  totalCount: number;
  rate: number | null; // % de présence
  lastPresentWhen: string | null;
  nextSession: string | null; // « jeudi 9 octobre à 13h, salle Landy »
  senderFirstName: string | null;
}) {
  return {
    system: `${BASE_RULES}
Tu rédiges une relance après une absence. Adapte le ton à l'historique : une première absence chez quelqu'un d'assidu = message léger et chaleureux (« vous nous avez manqué », on demande si tout va bien) ; plusieurs absences de suite = message plus direct mais bienveillant, qui rappelle que la place est précieuse, propose d'en parler (appel ou passage) et donne le prochain cours. Jamais de reproche, jamais de menace. 4 à 7 lignes, signé du prénom.
${languageNote(input.language)}`,
    user: `Prénom : ${input.firstName}
Groupe : ${input.groupName}
Dernière absence : ${input.missedWhen} (${input.streak} absence${input.streak > 1 ? "s de suite" : ""})
Présences : ${input.presentCount} sur ${input.totalCount} séances${input.rate != null ? ` (${input.rate} %)` : ""}
Dernière présence : ${input.lastPresentWhen ?? "inconnue"}
Prochain cours : ${input.nextSession ?? "non planifié"}
Expéditeur : ${input.senderFirstName ?? "l'équipe"}`,
    schema: FollowupSchema,
  };
}

// 3. Note libre → actions proposées ────────────────────────────────────────────────
export const ACTION_TYPES = ["noter_contact", "changer_statut", "changer_telephone", "absence_formatrice", "confirmer_reunion", "rappel", "non_compris"] as const;
export const ProposedActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  label: z.string().describe("Phrase courte en français décrivant l'action, telle que la coordinatrice la lira avant de cocher"),
  confidence: z.enum(["haute", "moyenne", "basse"]),
  learner_ref: z.string().nullable().describe("Référence A-0001 de l'apprenant concerné, ou null"),
  trainer_name: z.string().nullable().describe("Prénom de la formatrice concernée (absence), ou null"),
  phone: z.string().nullable().describe("Nouveau numéro tel qu'écrit dans la note, ou null"),
  status: z.enum(["nouveau", "injoignable", "contacte", "convoque", "evalue", "liste_attente", "inscrit", "sans_suite"]).nullable(),
  outcome: z.enum(["message_envoye", "joint", "sans_reponse", "convoque", "refus", "autre"]).nullable(),
  note: z.string().nullable().describe("Note à écrire dans le carnet de contact, ou null"),
  starts_on: z.string().nullable().describe("Date ISO AAAA-MM-JJ (début d'absence ou de rappel), ou null"),
  ends_on: z.string().nullable().describe("Date ISO de fin d'absence (= starts_on si un seul jour), ou null"),
  kind: z.enum(["conge", "maladie", "formation", "autre"]).nullable(),
  due_time: z.string().nullable().describe("Heure HH:MM d'un rappel, ou null"),
  text: z.string().nullable().describe("Texte du rappel ou phrase non comprise, ou null"),
});
export const NoteActionsSchema = z.object({
  actions: z.array(ProposedActionSchema),
  summary: z.string().describe("Une phrase : ce que tu as compris de la note"),
});
export function noteToActionsPrompt(input: {
  note: string;
  now: Date;
  roster: { ref: string; firstName: string; lastName: string; status: string }[];
  trainers: string[];
  nextMeeting: string | null; // « réunion d'information du jeudi 16 octobre 18h »
}) {
  const roster = input.roster.map((l) => `${l.ref} ${l.firstName} ${l.lastName} [${l.status}]`).join("\n");
  return {
    system: `${BASE_RULES}
La coordinatrice te dicte ce qui s'est passé dans la journée. Tu traduis chaque fait en action de l'outil, SANS rien exécuter : elle cochera.
Types d'action :
- noter_contact : un échange a eu lieu avec un apprenant (outcome : joint, message_envoye, sans_reponse, refus, autre ; note = ce qui a été dit) ;
- changer_statut : seulement si la note l'implique clairement (« ne veut plus », « inscrite », « injoignable ») ;
- changer_telephone : un nouveau numéro est donné ;
- absence_formatrice : une formatrice est absente (kind, starts_on, ends_on) ;
- confirmer_reunion : la personne confirme sa venue à la réunion d'information à venir ;
- rappel : quelque chose à faire plus tard (« rappeler jeudi 17h ») → starts_on = date, due_time, text ;
- non_compris : phrase que tu ne sais pas rattacher (text = la phrase).
Règles : résous « jeudi », « demain », « la semaine prochaine » à partir de la date du jour ; un apprenant est identifié par son prénom (et son nom si plusieurs ont le même prénom : sinon confidence = basse et tu cites les candidats dans label) ; un seul fait = une seule action ; conserve l'ordre de la note.`,
    user: `Date du jour : ${todayLabel(input.now)} (${todayIso(input.now)})
Prochaine réunion d'information : ${input.nextMeeting ?? "aucune"}
Formatrices : ${input.trainers.join(", ") || "aucune"}
Apprenants (référence prénom nom [statut]) :
${roster}

Note de la coordinatrice :
« ${input.note.trim()} »`,
    schema: NoteActionsSchema,
  };
}

// 4. Rappel extrait d'une note de contact ──────────────────────────────────────────
export const ReminderSchema = z.object({
  reminder: z
    .object({ text: z.string(), due_on: z.string().describe("AAAA-MM-JJ"), due_time: z.string().nullable().describe("HH:MM ou null") })
    .nullable()
    .describe("null si la note ne contient aucune chose à faire plus tard"),
});
// Pré-filtre sans IA : seules les notes qui ressemblent à un rappel déclenchent un appel.
export function hasReminderCue(note: string | null | undefined): boolean {
  if (!note) return false;
  return /\b(rappel|rappeler|relancer|recontacter|revenir vers|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|semaine prochaine|la semaine pro|apr[eè]s le|avant le|\d{1,2}\s?h\b|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})/i.test(note);
}
export function reminderPrompt(input: { note: string; firstName: string | null; now: Date }) {
  return {
    system: `${BASE_RULES}
Tu lis une note de carnet de contact et tu en extrais, s'il y en a UNE, la chose à faire plus tard (rappeler, relancer, envoyer, vérifier) avec sa date et son heure. Résous les jours relatifs à partir de la date du jour ; « jeudi » sans précision = le prochain jeudi ; « après 17h » → due_time 17:00. Pas de chose à faire → reminder = null. Le texte du rappel commence par un verbe et nomme la personne.`,
    user: `Date du jour : ${todayLabel(input.now)} (${todayIso(input.now)})
Apprenant : ${input.firstName ?? "inconnu"}
Note : « ${input.note.trim()} »`,
    schema: ReminderSchema,
  };
}

// 5. Proposition de place libérée ───────────────────────────────────────────────────
export const SeatOfferSchema = z.object({ fr: z.string(), translation: z.string().nullable() });
export function seatOfferPrompt(input: {
  firstName: string;
  language: string | null;
  groupName: string;
  schedule: string; // « lundi 9h-13h, mardi 9h-13h »
  place: string | null;
  firstSession: string | null;
  level: string | null;
  senderFirstName: string | null;
}) {
  return {
    system: `${BASE_RULES}
Une place vient de se libérer dans un groupe. Tu rédiges la proposition WhatsApp : bonne nouvelle, le groupe, les horaires sur une ligne 📅, le lieu 📍, la date du prochain cours, et une demande de réponse OUI ou NON rapidement (la place est proposée à d'autres personnes sinon). 5 à 8 lignes, signé.
${languageNote(input.language)}`,
    user: `Prénom : ${input.firstName}
Niveau : ${input.level ?? "non précisé"}
Groupe : ${input.groupName}
Horaires : ${input.schedule}
Lieu : ${input.place ?? "non précisé"}
Prochain cours : ${input.firstSession ?? "non précisé"}
Expéditeur : ${input.senderFirstName ?? "l'équipe"}`,
    schema: SeatOfferSchema,
  };
}

// 6. Brief avant d'appeler ──────────────────────────────────────────────────────────
export const BriefSchema = z.object({
  lines: z.array(z.string()).min(2).max(4).describe("2 à 4 lignes : d'où vient la personne, ce qu'on sait d'elle, où elle en est"),
  next_step: z.string().describe("La chose précise à lui proposer ou à lui demander lors de cet appel"),
  watch_out: z.string().nullable().describe("Un point d'attention (contradiction, info manquante), ou null"),
});
export function learnerBriefPrompt(input: {
  ref: string;
  firstName: string;
  provenance: string;
  status: string;
  level: string | null;
  writtenTest: string | null; // « fait le 12/09 : A2 (72/100) »
  oralTest: string | null; // « le 24/09 par Marie : A1 — comprend les questions simples »
  need: string | null;
  goal: string | null;
  contacts: string[]; // « 30/09 WhatsApp · message envoyé — … »
  groups: string[];
  nextMeeting: string | null;
  now: Date;
}) {
  return {
    system: `${BASE_RULES}
La coordinatrice va appeler cette personne. Donne-lui, en français simple et direct, de quoi mener l'appel sans relire le dossier : d'où vient la personne et ce qu'elle a dit, ce qu'on sait de son niveau et de son projet, où elle en est dans le parcours, et LA chose à proposer maintenant (test à faire, réunion à proposer, place à offrir, réponse à obtenir). Pas de formule de politesse, pas de répétition des dates inutiles.`,
    user: `Date du jour : ${todayLabel(input.now)}
Apprenant : ${input.firstName} (${input.ref})
Provenance : ${input.provenance}
Statut d'admission : ${input.status}
Niveau évalué : ${input.level ?? "aucun"}
Test écrit : ${input.writtenTest ?? "non fait"}
Entretien oral : ${input.oralTest ?? "non fait"}
Objectif : ${input.goal ?? "non renseigné"} · Besoin exprimé : ${input.need ?? "non renseigné"}
Groupes : ${input.groups.join(", ") || "aucun"}
Prochaine réunion d'information : ${input.nextMeeting ?? "aucune"}
Contacts (du plus récent au plus ancien) :
${input.contacts.length ? input.contacts.map((c) => `- ${c}`).join("\n") : "- aucun"}`,
    schema: BriefSchema,
  };
}

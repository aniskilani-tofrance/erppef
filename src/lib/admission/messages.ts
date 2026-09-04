// Messages prêts à envoyer (WhatsApp en premier, email en second) pour le parcours
// d'admission : premier contact, convocation à la réunion d'information, rappel.
// Même ton que l'invitation au test (src/lib/placement/invitation-message.ts) :
// vouvoiement, phrases courtes, destinataires en cours d'apprentissage du français.

const ORG_NAME = "Parler Emploi Formation";

function intro(senderFirstName: string | null | undefined): { intro: string; signature: string } {
  const name = senderFirstName?.trim() || null;
  return {
    intro: name ? `Je suis ${name} de ${ORG_NAME}.` : `Je vous écris de la part de ${ORG_NAME}.`,
    signature: name ?? `L'équipe ${ORG_NAME}`,
  };
}

function greeting(learnerFirstName: string | null | undefined): string {
  const name = learnerFirstName?.trim();
  return name ? `Bonjour ${name},` : "Bonjour,";
}

export type MeetingWhen = {
  startsAt: string; // ISO UTC
  endsAt?: string | null;
  place?: string | null; // salle ou lieu en clair
};

// « mardi 16 septembre 2026 à 14h00 » (+ « jusqu'à 16h00 » si une fin est connue)
export function formatMeetingWhen(m: MeetingWhen): string {
  const start = new Date(m.startsAt);
  const day = start.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
  });
  const time = (iso: string) =>
    new Date(iso)
      .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
      .replace(":", "h");
  const end = m.endsAt ? ` (jusqu'à ${time(m.endsAt)})` : "";
  return `${day} à ${time(m.startsAt)}${end}`;
}

// Premier contact après une demande de cours (fiche arrivée par le Drive, un partenaire…)
export function buildFirstContactMessage({
  learnerFirstName,
  senderFirstName,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
}): string {
  const { intro: i, signature } = intro(senderFirstName);
  return [
    greeting(learnerFirstName),
    "",
    `${i} Vous avez demandé des cours de français.`,
    "",
    "Je vous contacte pour organiser la suite : un test de niveau, puis une réunion d'information.",
    "",
    "Pouvez-vous me répondre ici, sur WhatsApp, pour me dire si vous êtes toujours intéressé(e) ?",
    "",
    "Merci, à bientôt,",
    signature,
  ].join("\n");
}

// Convocation à une réunion d'information (avec, par défaut, le petit entretien oral)
export function buildMeetingInvitationMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
  withOralTest = true,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
  withOralTest?: boolean;
}): string {
  const { intro: i, signature } = intro(senderFirstName);
  return [
    greeting(learnerFirstName),
    "",
    i,
    "",
    "Vous êtes invité(e) à une réunion d'information sur les cours de français :",
    `📅 ${formatMeetingWhen(meeting)}`,
    ...(meeting.place ? [`📍 ${meeting.place}`] : []),
    "",
    "Nous vous expliquons le programme, les horaires et le fonctionnement des cours.",
    ...(withOralTest
      ? ["Nous faisons aussi un petit entretien oral en français avec vous. Ce n'est pas un examen : c'est pour vous placer dans le bon groupe."]
      : []),
    "",
    "Merci de répondre à ce message pour confirmer votre présence : OUI ou NON.",
    "",
    "À bientôt,",
    signature,
  ].join("\n");
}

// Rappel la veille de la réunion
export function buildMeetingReminderMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
}): string {
  const { signature } = intro(senderFirstName);
  return [
    greeting(learnerFirstName),
    "",
    `Petit rappel : la réunion d'information de ${ORG_NAME} a lieu ${formatMeetingWhen(meeting)}.`,
    ...(meeting.place ? [`📍 ${meeting.place}`] : []),
    "",
    "Nous vous attendons. Si vous ne pouvez pas venir, merci de nous prévenir en répondant à ce message.",
    "",
    "À bientôt,",
    signature,
  ].join("\n");
}

// Version HTML d'un message texte (email) : paragraphes + sauts de ligne, texte échappé.
export function textToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

// Messages prêts à envoyer (WhatsApp en premier, email en second) pour le parcours
// d'admission. Les textes vivent dans src/lib/admission/templates.ts (un modèle par
// étape, retouchable par la coordination) ; ce fichier ne fait que remplir les modèles.

import { baseVars, buildStageMessage, DEFAULT_TEMPLATES, type Templates } from "@/lib/admission/templates";
import { testBeforeSentence } from "@/lib/placement/convocation-test";

export type MeetingWhen = {
  startsAt: string; // ISO UTC
  endsAt?: string | null;
  place?: string | null; // salle ou lieu en clair
  access?: string | null; // consignes pour trouver la salle
};

/**
 * Lieu en clair : « Salle 13 — 14 rue Alexandre Bachelet, Saint-Ouen ». Le lieu saisi sur la réunion
 * prime sur l'adresse de la salle ; s'il contient déjà le nom de la salle (« Salle 13 - 14 rue… »),
 * on ne le répète pas.
 */
export function formatMeetingPlace(
  roomName: string | null | undefined,
  location: string | null | undefined,
  address?: string | null,
): string | null {
  const name = roomName?.trim() || null;
  const detail = location?.trim() || address?.trim() || null;
  if (!name) return detail;
  if (!detail) return name;
  return detail.toLocaleLowerCase("fr").includes(name.toLocaleLowerCase("fr")) ? detail : `${name} — ${detail}`;
}

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
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  templates?: Templates;
}): string {
  return buildStageMessage("premier_contact", baseVars(learnerFirstName, senderFirstName), templates);
}

// Convocation à une réunion d'information (avec le petit entretien oral)
// testUrl : lien PERSONNEL du test de niveau de cette personne (null si elle l'a déjà fait) ; la
// phrase {test_avant} l'ajoute. Un modèle retouché sans {test_avant} reçoit la phrase à la fin :
// la personne n'est jamais convoquée sans son lien.
function withTest(text: string, template: string, testUrl: string | null | undefined): string {
  const sentence = testBeforeSentence(testUrl);
  return sentence && !template.includes("{test_avant}") ? `${text}\n\n${sentence}` : text;
}

export function buildMeetingInvitationMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
  withOralTest = true,
  testUrl = null,
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
  withOralTest?: boolean;
  testUrl?: string | null;
  templates?: Templates;
}): string {
  const tpl = withOralTest
    ? templates
    : { ...templates, convocation: templates.convocation.replace(/^Nous faisons aussi un petit entretien oral.*\n?/m, "") };
  const text = buildStageMessage(
    "convocation",
    {
      ...baseVars(learnerFirstName, senderFirstName),
      date: formatMeetingWhen(meeting),
      lieu: meeting.place ?? null,
      acces: meeting.access ?? null,
      test_avant: testBeforeSentence(testUrl),
    },
    tpl,
  );
  return withTest(text, tpl.convocation, testUrl);
}

// Rappel la veille de la réunion
export function buildMeetingReminderMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
  testUrl = null,
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
  testUrl?: string | null; // test de niveau pas encore fait : on rappelle le lien
  templates?: Templates;
}): string {
  const text = buildStageMessage(
    "rappel_reunion",
    {
      ...baseVars(learnerFirstName, senderFirstName),
      date: formatMeetingWhen(meeting),
      lieu: meeting.place ?? null,
      acces: meeting.access ?? null,
      test_avant: testBeforeSentence(testUrl),
    },
    templates,
  );
  return withTest(text, templates.rappel_reunion, testUrl);
}

// Absent(e) à la réunion : proposer une autre date
export function buildMissedMeetingMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
  templates?: Templates;
}): string {
  return buildStageMessage(
    "reunion_manquee",
    { ...baseVars(learnerFirstName, senderFirstName), date: formatMeetingWhen({ startsAt: meeting.startsAt }) },
    templates,
  );
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

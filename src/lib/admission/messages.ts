// Messages prêts à envoyer (WhatsApp en premier, email en second) pour le parcours
// d'admission. Les textes vivent dans src/lib/admission/templates.ts (un modèle par
// étape, retouchable par la coordination) ; ce fichier ne fait que remplir les modèles.

import { baseVars, buildStageMessage, DEFAULT_TEMPLATES, type Templates } from "@/lib/admission/templates";

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
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  templates?: Templates;
}): string {
  return buildStageMessage("premier_contact", baseVars(learnerFirstName, senderFirstName), templates);
}

// Convocation à une réunion d'information (avec le petit entretien oral)
export function buildMeetingInvitationMessage({
  learnerFirstName,
  senderFirstName,
  meeting,
  withOralTest = true,
  templates = DEFAULT_TEMPLATES,
}: {
  learnerFirstName: string | null | undefined;
  senderFirstName: string | null | undefined;
  meeting: MeetingWhen;
  withOralTest?: boolean;
  templates?: Templates;
}): string {
  const tpl = withOralTest
    ? templates
    : { ...templates, convocation: templates.convocation.replace(/^Nous faisons aussi un petit entretien oral.*\n?/m, "") };
  return buildStageMessage(
    "convocation",
    { ...baseVars(learnerFirstName, senderFirstName), date: formatMeetingWhen(meeting), lieu: meeting.place ?? null },
    tpl,
  );
}

// Rappel la veille de la réunion
export function buildMeetingReminderMessage({
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
    "rappel_reunion",
    { ...baseVars(learnerFirstName, senderFirstName), date: formatMeetingWhen(meeting), lieu: meeting.place ?? null },
    templates,
  );
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

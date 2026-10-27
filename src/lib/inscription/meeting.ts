import { utcToLocalDate, utcToLocalTime } from "@/lib/dates";
import { formatMeetingWhen } from "@/lib/admission/messages";
import { slotDayText, slotTimeText } from "@/lib/inscription/booking";
import { sanitizeSrc } from "@/lib/inscription/link";
import type { SignupLocale } from "@/lib/inscription/i18n";

// Inscription en ligne à une réunion d'information collective (/inscription/reunion/<jeton>) :
// états, places, lien, libellés traduits, notes du journal. Fichier pur (aucun accès base) :
// client et serveur. Les lectures et l'inscription atomique vivent dans meeting-server.ts.

// Jeton du lien : 32 caractères hexadécimaux (colonne info_meetings.signup_token).
const MEETING_TOKEN = /^[a-f0-9]{32}$/;

export function isMeetingToken(raw: unknown): raw is string {
  return typeof raw === "string" && MEETING_TOKEN.test(raw);
}

// Premier inscrit, premier servi : seules les personnes CONFIRMÉES (par le lien, ou « Confirmée »
// posé par l'équipe sur un OUI) ou présentes occupent une place ; une simple convocation (à envoyer,
// envoyée) n'en prend pas. Même règle que la fonction SQL signup_for_info_meeting (0057).
export const SEATED_STATUSES: readonly string[] = ["confirmee", "presente"];

// open   : on peut s'inscrire ; full : toutes les places sont prises ;
// closed : lien fermé par l'équipe, ou réunion déjà commencée.
export type MeetingState = "open" | "full" | "closed";

/** Places restantes ; null = pas de maximum. Jamais négatif (l'équipe peut convoquer au-delà à la main). */
export function placesLeft(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

export function meetingState(
  m: { signupOpen: boolean; startsAt: string; capacity: number | null; taken: number },
  now: Date = new Date(),
): MeetingState {
  if (!m.signupOpen || Date.parse(m.startsAt) <= now.getTime()) return "closed";
  if (m.capacity !== null && m.taken >= m.capacity) return "full";
  return "open";
}

/** Ce que la page publique sait d'une réunion (rien d'interne : ni notes, ni liste des inscrits). */
export type PublicMeeting = {
  token: string;
  title: string;
  startsAt: string; // ISO UTC
  endsAt: string | null;
  place: string | null; // salle + adresse, en clair
  access: string | null; // « comment trouver la salle »
  oralTest: boolean; // la réunion comprend un test oral individuel
  placesLeft: number | null;
  state: MeetingState;
  staggered?: boolean; // accueil échelonné : chaque inscrit reçoit son heure de passage
};

// Résultat d'une tentative d'inscription (celui de la fonction SQL signup_for_info_meeting).
export type MeetingOutcome = "registered" | "already" | "full" | "closed";
// convocationAt : heure de passage attribuée à la personne (accueil échelonné), sinon absente.
export type MeetingConfirmation = { outcome: MeetingOutcome; meeting: PublicMeeting; convocationAt?: string | null };

/** https://…/inscription/reunion/<jeton>, avec ?src= si une provenance est donnée. */
export function buildMeetingSignupUrl(origin: string, token: string, src?: string | null): string {
  const base = `${origin.replace(/\/+$/, "")}/inscription/reunion/${token}`;
  const s = sanitizeSrc(src);
  return s ? `${base}?src=${encodeURIComponent(s)}` : base;
}

/** « Samedi 7 novembre », « 14h00 », et « 16h00 » si une fin est connue — dans la langue de la page. */
export function meetingWhenText(
  m: Pick<PublicMeeting, "startsAt" | "endsAt">,
  locale: SignupLocale,
): { day: string; time: string; until: string | null } {
  return {
    day: slotDayText(utcToLocalDate(m.startsAt), locale),
    time: slotTimeText(utcToLocalTime(m.startsAt), locale),
    until: m.endsAt ? slotTimeText(utcToLocalTime(m.endsAt), locale) : null,
  };
}

/** Fin de l'événement « Ajouter à mon agenda » : la fin connue, sinon 2 h après le début. */
export function meetingCalendarEnd(m: Pick<PublicMeeting, "startsAt" | "endsAt">): string {
  return m.endsAt ?? new Date(Date.parse(m.startsAt) + 2 * 3_600_000).toISOString();
}

/**
 * Dates du message du lien ({date}) : une session → sa date ; plusieurs sessions sur le même lien →
 * « Au choix : » puis une ligne par session, pour que la personne sache qu'elle choisira son jour.
 */
export function choiceDatesText(whenTexts: readonly string[]): string {
  if (whenTexts.length <= 1) return whenTexts[0] ?? "";
  return ["Au choix :", ...whenTexts.map((w) => `• ${w}`)].join("\n");
}

/** Phrase de l'accueil échelonné pour le message du lien ({heure_passage}) ; null sans accueil échelonné. */
export function staggerSentence(minutes: number | null | undefined): string | null {
  return minutes ? `🕒 Chacun reçoit son heure de passage en s'inscrivant (une arrivée toutes les ${minutes} minutes).` : null;
}

/** Phrase sur le test oral pour le message WhatsApp ({test_oral}) ; null si la réunion n'en comprend pas. */
export function oralTestSentence(oralTest: boolean): string | null {
  return oralTest ? "🗣️ Après la réunion : un petit test oral avec chaque personne (ce n'est pas un examen)." : null;
}

/** Note du journal d'admission (learner_contacts.note) après une tentative d'inscription par le lien. */
export function meetingJournalNote(outcome: MeetingOutcome, m: Pick<PublicMeeting, "startsAt" | "oralTest">): string {
  const when = formatMeetingWhen({ startsAt: m.startsAt });
  switch (outcome) {
    case "registered":
      return `Inscrit(e) par le lien à la réunion d'information du ${when}${m.oralTest ? " (test oral individuel inclus)" : ""}`;
    case "already":
      return `Déjà inscrit(e) à la réunion d'information du ${when} : confirmé(e) par le lien`;
    case "full":
      return `Réunion d'information du ${when} complète : à prévenir pour la prochaine réunion`;
    case "closed":
      return `Inscription à la réunion d'information du ${when} fermée : à prévenir pour la prochaine réunion`;
  }
}

// Ce que la page d'un lien propose, selon les créneaux qu'elle porte :
//   closed : aucun créneau ouvrable (tous fermés ou commencés) → pas de formulaire ;
//   single : un seul créneau à proposer (ou tous complets : on garde le numéro pour la prochaine) ;
//   choice : plusieurs créneaux ouverts avec des places → la personne choisit son jour et son heure.
export type MeetingOffer =
  | { kind: "closed" }
  | { kind: "single"; meeting: PublicMeeting }
  | { kind: "choice"; meetings: PublicMeeting[] };

export function chooseMeetingOffer(meetings: readonly PublicMeeting[]): MeetingOffer {
  const sorted = [...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const bookable = sorted.filter((m) => m.state !== "closed");
  if (bookable.length === 0) return { kind: "closed" };
  const open = bookable.filter((m) => m.state === "open");
  if (open.length === 0) return { kind: "single", meeting: bookable[0] }; // tout est complet : le plus proche
  if (open.length === 1) return { kind: "single", meeting: open[0] };
  return { kind: "choice", meetings: open };
}

// ── Créneaux d'un même lien, côté équipe ────────────────────────────────────
// Ce que le lien fait d'un créneau, en clair : proposé (ouvert, à venir, avec des places), complet
// (ouvert mais plus de place : les convocations faites à la main comptent), fermé, ou passé.
export type SlotOfferState = "propose" | "complet" | "ferme" | "passe";

export function slotOfferState(
  s: { startsAt: string; signupOpen: boolean; capacity: number | null; taken: number },
  now: Date = new Date(),
): SlotOfferState {
  if (Date.parse(s.startsAt) <= now.getTime()) return "passe";
  if (!s.signupOpen) return "ferme";
  if (s.capacity !== null && s.taken >= s.capacity) return "complet";
  return "propose";
}

/**
 * Ouvrir ou fermer le lien : tous les créneaux du lien ensemble (le lien est commun). Ouvrir ne
 * touche que les créneaux à venir, et exige un nombre maximum de places sur chacun ; fermer ferme tout.
 */
export function signupToggleTargets(
  slots: readonly { id: string; startsAt: string; capacity: number | null }[],
  open: boolean,
  now: Date = new Date(),
): { ok: true; ids: string[] } | { ok: false; reason: "started" | "capacity"; missing: number } {
  if (!open) return { ok: true, ids: slots.map((s) => s.id) };
  const upcoming = slots.filter((s) => Date.parse(s.startsAt) > now.getTime());
  if (upcoming.length === 0) return { ok: false, reason: "started", missing: 0 };
  const missing = upcoming.filter((s) => !s.capacity).length;
  if (missing) return { ok: false, reason: "capacity", missing };
  return { ok: true, ids: upcoming.map((s) => s.id) };
}

/** Libellé court des places pour l'équipe : « 12 / 20 · 8 restantes ». */
export function placesSummary(capacity: number | null, taken: number): string {
  if (capacity === null) return `${taken} inscrit${taken > 1 ? "s" : ""}`;
  const left = placesLeft(capacity, taken)!;
  return `${taken} / ${capacity} · ${left === 0 ? "complet" : `${left} restante${left > 1 ? "s" : ""}`}`;
}

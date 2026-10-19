// Rendez-vous d'admission individuels (entretien, test oral…) : libellés, choix du
// canal du journal, notes du journal et message WhatsApp de confirmation.
// Fichier pur (aucun accès réseau ni base) : utilisable côté serveur comme côté client.
// La synchronisation Google Agenda vit dans src/lib/gcal-admissions.ts.

import type { ContactChannel } from "@/lib/admission/status";

export const DEFAULT_APPOINTMENT_ADDRESS = "1 place Martin Levasseur, Saint-Ouen";
export const DEFAULT_APPOINTMENT_MINUTES = 30;
export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90] as const;

const TZ = "Europe/Paris";

export const APPOINTMENT_KINDS = [
  { code: "entretien", label: "Entretien d'admission" },
  { code: "test_oral", label: "Test oral" },
  { code: "autre", label: "Autre" },
] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number]["code"];
export const APPOINTMENT_KIND_CODES = APPOINTMENT_KINDS.map((k) => k.code) as [AppointmentKind, ...AppointmentKind[]];

export const APPOINTMENT_MODES = [
  { code: "sur_site", label: "Sur site" },
  { code: "telephone", label: "Téléphone" },
  { code: "visio", label: "Visio" },
] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number]["code"];
export const APPOINTMENT_MODE_CODES = APPOINTMENT_MODES.map((m) => m.code) as [AppointmentMode, ...AppointmentMode[]];

export const APPOINTMENT_STATUSES = [
  { code: "prevu", label: "Prévu" },
  { code: "honore", label: "Honoré" },
  { code: "absent", label: "Absent(e)" },
  { code: "annule", label: "Annulé" },
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]["code"];
export const APPOINTMENT_STATUS_CODES = APPOINTMENT_STATUSES.map((s) => s.code) as [AppointmentStatus, ...AppointmentStatus[]];

export function appointmentKindLabel(code: string | null | undefined): string {
  return APPOINTMENT_KINDS.find((k) => k.code === code)?.label ?? "Entretien d'admission";
}
export function appointmentModeLabel(code: string | null | undefined): string {
  return APPOINTMENT_MODES.find((m) => m.code === code)?.label ?? "Sur site";
}
export function appointmentStatusLabel(code: string | null | undefined): string {
  return APPOINTMENT_STATUSES.find((s) => s.code === code)?.label ?? "Prévu";
}

// Canal du journal des contacts (contrainte learner_contacts.channel) d'après le mode.
// La visio passe par l'appel vidéo WhatsApp pour notre public : canal « whatsapp ».
export function channelForMode(mode: string | null | undefined): ContactChannel {
  switch (mode) {
    case "telephone":
      return "telephone";
    case "visio":
      return "whatsapp";
    default:
      return "presentiel";
  }
}

// Lieu à afficher : l'adresse saisie, sinon l'adresse de l'organisme (sur site),
// sinon le mode (téléphone, visio).
export function appointmentPlace(mode: string | null | undefined, location: string | null | undefined): string {
  const loc = location?.trim();
  if (loc) return loc;
  if (mode === "telephone") return "Par téléphone";
  if (mode === "visio") return "En visio";
  return DEFAULT_APPOINTMENT_ADDRESS;
}

// « 21/10 à 14h30 » (heure de Paris)
export function shortWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TZ });
  return `${day} à ${timeOf(iso)}`;
}

// « 14h30 » (heure de Paris)
export function timeOf(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
    .replace(":", "h");
}

// « mardi 21 octobre » (heure de Paris)
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

// Durée en minutes entre deux instants ISO (arrondie).
export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
}

type NoteInput = { startsAt: string; mode: string | null | undefined; kind?: string | null };

function kindSuffix(kind: string | null | undefined): string {
  return kind && kind !== "entretien" ? ` (${appointmentKindLabel(kind).toLowerCase()})` : "";
}

// Notes du journal des contacts, une par événement du rendez-vous.
export function appointmentJournalNote(
  event: "pose" | "deplace" | "annule" | "honore" | "absent",
  rdv: NoteInput,
  previousStartsAt?: string | null,
): string {
  const label = `RDV d'admission${kindSuffix(rdv.kind)}`;
  const mode = appointmentModeLabel(rdv.mode).toLowerCase();
  switch (event) {
    case "pose":
      return `${label} posé le ${shortWhen(rdv.startsAt)} — ${mode}`;
    case "deplace":
      return `${label} déplacé au ${shortWhen(rdv.startsAt)} — ${mode}${previousStartsAt ? ` (au lieu du ${shortWhen(previousStartsAt)})` : ""}`;
    case "annule":
      return `${label} du ${shortWhen(rdv.startsAt)} annulé`;
    case "honore":
      return `${label} du ${shortWhen(rdv.startsAt)} honoré`;
    case "absent":
      return `Absent(e) au ${label} du ${shortWhen(rdv.startsAt)}`;
  }
}

// Message WhatsApp de confirmation, en français simple (niveau A1).
export function buildAppointmentConfirmation({
  firstName,
  startsAt,
  mode,
  location,
}: {
  firstName: string | null | undefined;
  startsAt: string;
  mode: string | null | undefined;
  location: string | null | undefined;
}): string {
  const hello = firstName?.trim() ? `Bonjour ${firstName.trim()}` : "Bonjour";
  const when = `le ${dayLabel(startsAt)} à ${timeOf(startsAt)}`;
  if (mode === "telephone") return `${hello}, rendez-vous par téléphone avec ParlerEmploi ${when}. Nous vous appelons. Répondez OK.`;
  if (mode === "visio") return `${hello}, rendez-vous en vidéo avec ParlerEmploi ${when}. Répondez OK.`;
  return `${hello}, rendez-vous à ParlerEmploi ${when}, ${appointmentPlace(mode, location)}. Répondez OK.`;
}

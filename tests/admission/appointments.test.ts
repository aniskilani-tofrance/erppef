import { describe, expect, it } from "vitest";
import {
  appointmentJournalNote,
  appointmentPlace,
  buildAppointmentConfirmation,
  channelForMode,
  DEFAULT_APPOINTMENT_ADDRESS,
  durationMinutes,
  isAdmissionKind,
  shortWhen,
} from "@/lib/admission/appointments";
import { CONTACT_CHANNELS } from "@/lib/admission/status";

// 21 octobre 2026, 14h30 à Paris (UTC+2, heure d'été)
const STARTS = "2026-10-21T12:30:00.000Z";

describe("rendez-vous d'admission — canal du journal", () => {
  it("suit le mode et reste dans les valeurs autorisées par la contrainte", () => {
    expect(channelForMode("sur_site")).toBe("presentiel");
    expect(channelForMode("telephone")).toBe("telephone");
    expect(channelForMode("visio")).toBe("whatsapp");
    expect(channelForMode(null)).toBe("presentiel");
    const allowed = CONTACT_CHANNELS.map((c) => c.code) as string[];
    for (const m of ["sur_site", "telephone", "visio", "inconnu"]) expect(allowed).toContain(channelForMode(m));
  });
});

describe("rendez-vous d'admission — notes du journal", () => {
  it("pose en ligne (la personne a réservé à la fin du formulaire)", () => {
    expect(appointmentJournalNote("pose", { startsAt: STARTS, mode: "sur_site", kind: "entretien", bookedOnline: true })).toBe(
      "RDV d'admission réservé en ligne par la personne (formulaire) pour le 21/10 à 14h30 — sur site",
    );
  });

  it("pose : date et heure de Paris, mode", () => {
    expect(appointmentJournalNote("pose", { startsAt: STARTS, mode: "sur_site", kind: "entretien" })).toBe(
      "RDV d'admission posé le 21/10 à 14h30 — sur site",
    );
  });

  it("précise le type quand ce n'est pas un entretien", () => {
    expect(appointmentJournalNote("pose", { startsAt: STARTS, mode: "telephone", kind: "test_oral" })).toBe(
      "RDV d'admission (test oral) posé le 21/10 à 14h30 — téléphone",
    );
  });

  it("déplacement, annulation, résultat", () => {
    expect(appointmentJournalNote("deplace", { startsAt: STARTS, mode: "visio" }, "2026-10-20T08:00:00.000Z")).toBe(
      "RDV d'admission déplacé au 21/10 à 14h30 — visio (au lieu du 20/10 à 10h00)",
    );
    expect(appointmentJournalNote("annule", { startsAt: STARTS, mode: "sur_site" })).toBe("RDV d'admission du 21/10 à 14h30 annulé");
    expect(appointmentJournalNote("honore", { startsAt: STARTS, mode: "sur_site" })).toBe("RDV d'admission du 21/10 à 14h30 honoré");
    expect(appointmentJournalNote("absent", { startsAt: STARTS, mode: "sur_site" })).toBe("Absent(e) au RDV d'admission du 21/10 à 14h30");
  });

  it("heure d'hiver : 10h00 à Paris = 09:00 UTC", () => {
    expect(shortWhen("2026-12-01T09:00:00.000Z")).toBe("01/12 à 10h00");
  });
});

describe("rendez-vous d'admission — message WhatsApp de confirmation", () => {
  it("sur site : jour, heure, adresse par défaut, « Répondez OK »", () => {
    expect(buildAppointmentConfirmation({ firstName: "Awa", startsAt: STARTS, mode: "sur_site", location: null })).toBe(
      `Bonjour Awa, rendez-vous à ParlerEmploi le mercredi 21 octobre à 14h30, ${DEFAULT_APPOINTMENT_ADDRESS}. Répondez OK.`,
    );
  });

  it("garde l'adresse saisie, et sait faire sans prénom", () => {
    expect(buildAppointmentConfirmation({ firstName: "  ", startsAt: STARTS, mode: "sur_site", location: "Salle 12, 14 rue Bachelet" })).toBe(
      "Bonjour, rendez-vous à ParlerEmploi le mercredi 21 octobre à 14h30, Salle 12, 14 rue Bachelet. Répondez OK.",
    );
  });

  it("téléphone et visio : pas d'adresse", () => {
    expect(buildAppointmentConfirmation({ firstName: "Omar", startsAt: STARTS, mode: "telephone", location: null })).toBe(
      "Bonjour Omar, rendez-vous par téléphone avec ParlerEmploi le mercredi 21 octobre à 14h30. Nous vous appelons. Répondez OK.",
    );
    expect(buildAppointmentConfirmation({ firstName: "Omar", startsAt: STARTS, mode: "visio", location: "lien" })).toBe(
      "Bonjour Omar, rendez-vous en vidéo avec ParlerEmploi le mercredi 21 octobre à 14h30. Répondez OK.",
    );
  });
});

describe("rendez-vous d'admission — lieu et durée", () => {
  it("lieu : saisi, sinon adresse de l'organisme ou mode", () => {
    expect(appointmentPlace("sur_site", null)).toBe(DEFAULT_APPOINTMENT_ADDRESS);
    expect(appointmentPlace("sur_site", " Salle 3 ")).toBe("Salle 3");
    expect(appointmentPlace("telephone", "")).toBe("Par téléphone");
    expect(appointmentPlace("visio", null)).toBe("En visio");
  });

  it("durée en minutes", () => {
    expect(durationMinutes(STARTS, "2026-10-21T13:00:00.000Z")).toBe(30);
  });
});

describe("rendez-vous « Diagnostic partagé ToFrance »", () => {
  it("hors parcours d'admission : journal dédié, aucun effet sur le statut", () => {
    expect(isAdmissionKind("diagnostic_tofrance")).toBe(false);
    expect(isAdmissionKind("entretien")).toBe(true);
    expect(isAdmissionKind("test_oral")).toBe(true);
    expect(appointmentJournalNote("pose", { startsAt: STARTS, mode: "visio", kind: "diagnostic_tofrance" })).toBe(
      "RDV diagnostic partagé ToFrance posé le 21/10 à 14h30 — visio",
    );
  });
});

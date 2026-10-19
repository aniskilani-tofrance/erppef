import { describe, expect, it } from "vitest";
import { eventNeedsUpdate } from "@/lib/gcal";
import {
  ADMISSIONS_CALENDAR_NAME,
  admissionsCalendarTag,
  appointmentEventBody,
  appointmentEventId,
  learnerFicheUrl,
  wantsEvent,
  type AppointmentForCalendar,
} from "@/lib/gcal-admissions";

const rdv: AppointmentForCalendar = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  starts_at: "2026-10-21T12:30:00.000Z",
  ends_at: "2026-10-21T13:00:00.000Z",
  kind: "entretien",
  mode: "sur_site",
  location: null,
  notes: "Vient avec sa fille qui traduit.",
  status: "prevu",
  learner: { first_name: "Awa", last_name: "Diallo", learner_no: 42, phone: "0612345678" },
};

describe("agenda Google des rendez-vous d'admission — réservé en ligne", () => {
  it("mention dans le titre et la description", () => {
    const body = appointmentEventBody({ ...rdv, booked_online: true });
    expect(body.summary).toBe("RDV admission · Awa Diallo (A-0042) · réservé en ligne");
    expect(body.description).toMatch(/^Rendez-vous d'admission réservé en ligne par la personne/);
    expect(appointmentEventBody(rdv).summary).toBe("RDV admission · Awa Diallo (A-0042)");
  });
});

describe("agenda Google des rendez-vous d'admission — identifiants", () => {
  it("id d'événement = uuid sans tirets, marqueur d'agenda par organisme", () => {
    expect(appointmentEventId(rdv.id)).toBe("7c9e6679742540de944be07fc1f90ae7");
    expect(appointmentEventId(rdv.id)).toMatch(/^[0-9a-v]{5,1024}$/); // base32hex exigé par Google
    expect(admissionsCalendarTag("org-1")).toBe("erp-admissions:org-1");
    expect(ADMISSIONS_CALENDAR_NAME).toBe("Admissions PEF — Rendez-vous");
  });

  it("lien vers la fiche : par référence, sinon par nom", () => {
    expect(learnerFicheUrl(rdv)).toBe("https://pef-erp.vercel.app/apprenants?q=A-0042");
    expect(learnerFicheUrl({ ...rdv, learner: { ...rdv.learner!, learner_no: null } })).toBe(
      "https://pef-erp.vercel.app/apprenants?q=Awa%20Diallo",
    );
  });
});

describe("agenda Google des rendez-vous d'admission — corps d'événement", () => {
  it("titre, lieu par défaut, description (téléphone, mode, notes, fiche), horaires, marqueur", () => {
    const body = appointmentEventBody(rdv);
    expect(body.summary).toBe("RDV admission · Awa Diallo (A-0042)");
    expect(body.location).toBe("1 place Martin Levasseur, Saint-Ouen");
    expect(body.description).toContain("Type : Entretien d'admission");
    expect(body.description).toContain("Mode : Sur site");
    expect(body.description).toContain("Téléphone : 06 12 34 56 78");
    expect(body.description).toContain("Notes : Vient avec sa fille qui traduit.");
    expect(body.description).toContain("Fiche ERP : https://pef-erp.vercel.app/apprenants?q=A-0042");
    expect(body.description).not.toContain("Résultat");
    expect(body.status).toBe("confirmed");
    expect(body.start).toEqual({ dateTime: rdv.starts_at, timeZone: "Europe/Paris" });
    expect(body.end).toEqual({ dateTime: rdv.ends_at, timeZone: "Europe/Paris" });
    expect(body.extendedProperties).toEqual({ private: { erp: "pef", appointmentId: rdv.id } });
  });

  it("test oral dans le titre, téléphone sans adresse, résultat dans la description", () => {
    const body = appointmentEventBody({ ...rdv, kind: "test_oral", mode: "telephone", status: "honore", notes: null });
    expect(body.summary).toBe("RDV admission · Awa Diallo (A-0042) · Test oral");
    expect(body.location).toBe("Par téléphone");
    expect(body.description).toContain("Résultat : Honoré");
    expect(body.description).not.toContain("Notes :");
  });

  it("sans numéro ni référence", () => {
    const body = appointmentEventBody({ ...rdv, learner: { first_name: "Omar", last_name: null, learner_no: null, phone: null } });
    expect(body.summary).toBe("RDV admission · Omar");
    expect(body.description).toContain("Téléphone : non renseigné");
  });

  it("annulé = pas d'événement ; prévu, honoré, absent = événement", () => {
    expect(wantsEvent("annule")).toBe(false);
    for (const s of ["prevu", "honore", "absent"]) expect(wantsEvent(s)).toBe(true);
  });
});

describe("agenda Google des rendez-vous d'admission — comparaison", () => {
  it("rien à réécrire si Google a le même événement (format d'heure différent)", () => {
    const desired = appointmentEventBody(rdv);
    const onGoogle = { ...desired, start: { dateTime: "2026-10-21T14:30:00+02:00" }, end: { dateTime: "2026-10-21T15:00:00+02:00" } };
    expect(eventNeedsUpdate(onGoogle, desired)).toBe(false);
  });

  it("déplacement, nouvelle note ou événement supprimé à la main → réécriture", () => {
    const desired = appointmentEventBody(rdv);
    expect(eventNeedsUpdate(appointmentEventBody({ ...rdv, starts_at: "2026-10-21T13:00:00.000Z", ends_at: "2026-10-21T13:30:00.000Z" }), desired)).toBe(true);
    expect(eventNeedsUpdate(appointmentEventBody({ ...rdv, notes: "autre" }), desired)).toBe(true);
    expect(eventNeedsUpdate({ ...desired, status: "cancelled" }, desired)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { BREVO_LEAD_EVENTS, brevoEventForStatus, buildBrevoLeadPayload } from "@/lib/leads/brevo";
import { DEFAULT_LEAD_SETTINGS } from "@/lib/leads/templates";

describe("événements Brevo des leads restaurateurs", () => {
  const lead = {
    id: "b4f77a63-d2fc-40bf-859f-f56d9e93a16b",
    lead_no: 15,
    company: "Chez Karim",
    contact_name: "Karim Benali",
    email: "Karim@ChezKarim.fr",
    phone: "+33612345678",
    city: "Saint-Denis",
    postal_code: "93200",
    positions: "Commis de cuisine",
    positions_count: 2,
    segment: "traditionnel",
    status: "rdv_pris",
    rdv_at: "2026-09-18T13:00:00.000Z",
    rdv_mode: "sur_site",
  };

  it("construit un payload plat, complet et personnalisable par Brevo", () => {
    const payload = buildBrevoLeadPayload(
      lead,
      { ...DEFAULT_LEAD_SETTINGS, calendlyUrl: "https://calendly.com/contact-parleremploi/30min", directorName: "Anis Kilani" },
      BREVO_LEAD_EVENTS.rdvPris,
      new Date("2026-09-16T12:00:00.000Z"),
    );

    expect(payload).toMatchObject({
      event_name: "poei_lead_rdv_pris",
      event_date: "2026-09-16T12:00:00.000Z",
      email: "karim@chezkarim.fr",
      identifier: "karim@chezkarim.fr",
      lead_ref: "L-0015",
      prenom: "Karim",
      nom: "Benali",
      entreprise: "Chez Karim",
      postes: "Commis de cuisine",
      nb_postes: 2,
      rdv_format: "sur_site",
      directeur: "Anis Kilani",
    });
    expect(Object.values(payload).some((value) => typeof value === "object")).toBe(false);
  });

  it("n'active que les emails rattachés à un statut clair", () => {
    expect(brevoEventForStatus("nouveau")).toBe(BREVO_LEAD_EVENTS.nouveau);
    expect(brevoEventForStatus("a_rappeler")).toBe(BREVO_LEAD_EVENTS.aRappeler);
    expect(brevoEventForStatus("rdv_pris")).toBe(BREVO_LEAD_EVENTS.rdvPris);
    expect(brevoEventForStatus("qualifie")).toBeNull();
    expect(brevoEventForStatus("perdu")).toBeNull();
  });
});

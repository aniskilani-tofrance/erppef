import { describe, expect, it } from "vitest";
import { leadsToCsv, parseLeadsImport, segmentFromText, splitCity } from "@/lib/leads/csv";

describe("import de leads", () => {
  it("lit le collage du Google Sheet de suivi (avec en-têtes, tabulations)", () => {
    const text = [
      "Date réception\tSource / Canal\tCampagne (UTM)\tEntreprise\tSecteur\tContact (Prénom NOM)\tFonction\tTéléphone\tEmail\tVille / CP\tPoste(s) à pourvoir\tNb postes\tType de contrat envisagé\tÉchéance embauche\tOPCO\tScore (Chaud/Tiède/Froid)\tStatut\tPropriétaire\tDate 1er contact\tNb tentatives\tProchaine action\tDate prochaine action\tMontant potentiel (€)\tNotes",
      "2026-09-10\tFormulaire agence\tV2 galère\tChez Karim\tRestaurant traditionnel\tKarim BENALI\tGérant\t06 12 34 56 78\tk@chezkarim.fr\tSaint-Denis 93200\tCommis, plongeur\t2\tCDI\tnovembre\tAKTO\tChaud\tNouveau\tShahzad\t\t0\tAppel\t2026-09-10\t9900\tOuvert 7/7",
    ].join("\n");
    const rows = parseLeadsImport(text);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.company).toBe("Chez Karim");
    expect(r.contactName).toBe("Karim BENALI");
    expect(r.phone).toBe("06 12 34 56 78");
    expect(r.city).toBe("Saint-Denis");
    expect(r.postalCode).toBe("93200");
    expect(r.positionsCount).toBe(2);
    expect(r.contractType).toBe("cdi");
    expect(r.segment).toBe("traditionnel");
    expect(r.score).toBe("chaud");
    expect(r.status).toBe("nouveau");
    expect(r.source).toBe("formulaire_meta");
    expect(r.receivedAt).toBe("2026-09-10");
    expect(r.notes).toBe("Ouvert 7/7");
  });

  it("lit une liste simple sans en-tête (Entreprise ; Contact ; Téléphone ; Email ; Ville ; Postes ; Nb ; Notes)", () => {
    const rows = parseLeadsImport("McDonald's Saint-Ouen;Nadia;0612345678;;Saint-Ouen 93400;équipiers;3;franchisé multi-sites\nLigne vide;;;;;;;");
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe("McDonald's Saint-Ouen");
    expect(rows[0].positionsCount).toBe(3);
    expect(rows[0].postalCode).toBe("93400");
  });

  it("devine le segment à partir d'un texte libre", () => {
    expect(segmentFromText("KFC Bobigny")).toBe("rapide_franchise");
    expect(segmentFromText("Sodexo cuisine centrale")).toBe("collective");
    expect(segmentFromText("Brasserie")).toBe("traditionnel");
    expect(segmentFromText("BTP")).toBe("hors_restauration");
    expect(segmentFromText("")).toBeNull();
  });

  it("sépare ville et code postal", () => {
    expect(splitCity("Saint-Ouen 93400")).toEqual({ city: "Saint-Ouen", postalCode: "93400" });
    expect(splitCity("93200, Saint-Denis")).toEqual({ city: "Saint-Denis", postalCode: "93200" });
    expect(splitCity("Paris")).toEqual({ city: "Paris", postalCode: null });
  });
});

describe("export CSV", () => {
  it("écrit les 24 colonnes du Sheet dans l'ordre, avec BOM et point-virgule", () => {
    const csv = leadsToCsv([
      {
        lead_no: 7, received_at: "2026-09-10T08:00:00Z", source: "formulaire_meta", campaign: null, company: "Chez Karim; le vrai",
        segment: "traditionnel", contact_name: "Karim", contact_role: null, phone: "0612345678", email: null, city: "Saint-Denis",
        postal_code: "93200", positions: "commis", positions_count: 2, contract_type: "cdi", hours_per_week: 39, hiring_horizon: "1_3m",
        hiring_deadline: "novembre", decision_maker: true, haccp_status: "oui", score: "chaud", status: "rdv_pris", lost_reason: null,
        offer: "poei", owner_name: "Shahzad", first_contact_at: "2026-09-10T09:00:00Z", attempts: 1, next_action: "SMS veille",
        next_action_on: "2026-09-17", rdv_at: "2026-09-18T13:00:00Z", rdv_mode: "sur_site", rdv_outcome: "a_venir", notes: null,
      },
    ]);
    expect(csv.startsWith("﻿Date réception;Source / Canal;")).toBe(true);
    const line = csv.split("\r\n")[1];
    expect(line).toContain('"Chez Karim; le vrai"');
    expect(line).toContain(";9900;"); // 2 postes × 4 950 €
    expect(line).toContain(";L-0007;");
    expect(line.split(";").length).toBeGreaterThanOrEqual(33);
  });
});

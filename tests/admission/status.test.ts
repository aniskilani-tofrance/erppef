import { describe, expect, it } from "vitest";
import {
  ADMISSION_STATUSES,
  nextAdmissionStatus,
  suggestedStatus,
} from "@/lib/admission/status";

describe("statut d'admission", () => {
  it("avance mais ne recule jamais automatiquement", () => {
    expect(nextAdmissionStatus("nouveau", "contacte")).toBe("contacte");
    expect(nextAdmissionStatus("convoque", "contacte")).toBe("convoque");
    expect(nextAdmissionStatus("evalue", "convoque")).toBe("evalue");
    expect(nextAdmissionStatus(null, "convoque")).toBe("convoque");
    expect(nextAdmissionStatus("inconnu", "contacte")).toBe("contacte");
  });

  it("« inscrit » est définitif, « sans suite » est explicite mais réversible", () => {
    expect(nextAdmissionStatus("inscrit", "sans_suite")).toBe("inscrit");
    expect(nextAdmissionStatus("inscrit", "contacte")).toBe("inscrit");
    expect(nextAdmissionStatus("contacte", "inscrit")).toBe("inscrit");
    expect(nextAdmissionStatus("convoque", "sans_suite")).toBe("sans_suite");
    expect(nextAdmissionStatus("sans_suite", "contacte")).toBe("contacte");
  });

  it("propose le bon statut selon le résultat du contact", () => {
    expect(suggestedStatus("message_envoye", "nouveau")).toBe("contacte");
    expect(suggestedStatus("joint", "injoignable")).toBe("contacte");
    expect(suggestedStatus("sans_reponse", "nouveau")).toBe("injoignable");
    // Une relance sans réponse ne fait pas reculer un convoqué
    expect(suggestedStatus("sans_reponse", "convoque")).toBe("convoque");
    expect(suggestedStatus("sans_reponse", "contacte")).toBe("contacte");
    expect(suggestedStatus("convoque", "contacte")).toBe("convoque");
    expect(suggestedStatus("refus", "convoque")).toBe("sans_suite");
    expect(suggestedStatus("autre", "contacte")).toBe("contacte");
    expect(suggestedStatus("joint", "inscrit")).toBe("inscrit");
  });

  it("les rangs sont uniques et croissants", () => {
    const ranks = ADMISSION_STATUSES.map((s) => s.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

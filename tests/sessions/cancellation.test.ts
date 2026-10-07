import { describe, expect, it } from "vitest";
import { CANCEL_REASONS, CANCEL_REASON_LABELS, describeCancellation } from "@/lib/sessions/cancellation";

describe("motifs d'annulation", () => {
  it("chaque motif a un libellé", () => {
    for (const r of CANCEL_REASONS) expect(CANCEL_REASON_LABELS[r]).toBeTruthy();
  });

  it("décrit l'annulation avec ou sans précision, et les anciennes séances sans motif", () => {
    expect(describeCancellation("absence_formateur", null)).toBe("Annulée · Absence imprévue du formateur");
    expect(describeCancellation("absence_formateur", " malade ")).toBe("Annulée · Absence imprévue du formateur (malade)");
    expect(describeCancellation(null, null)).toBe("Annulée");
    expect(describeCancellation("inconnu", "grève")).toBe("Annulée · grève");
  });
});

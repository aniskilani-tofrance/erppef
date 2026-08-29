import { describe, expect, it } from "vitest";
import { qpvAtPoint } from "@/lib/geo/qpv";

// Points de contrôle sur les périmètres officiels ANCT 2024 embarqués.
describe("qpvAtPoint", () => {
  it("détecte le Franc-Moisin (Saint-Denis, 93)", async () => {
    const hit = await qpvAtPoint(2.370048, 48.928224);
    expect(hit).not.toBeNull();
    expect(hit!.code.startsWith("QN093")).toBe(true);
  });

  it("ne détecte rien place de l'Opéra (Paris)", async () => {
    expect(await qpvAtPoint(2.33, 48.87)).toBeNull();
  });

  it("ne détecte rien en pleine mer", async () => {
    expect(await qpvAtPoint(-10, 45)).toBeNull();
  });
});

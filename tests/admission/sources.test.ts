import { describe, expect, it } from "vitest";
import { CONTACT_SOURCES } from "@/lib/referentiels";
import { allSourceStyles, sourceStyle, sourceTitle } from "@/lib/admission/sources";

describe("provenance des apprenants — pastilles", () => {
  it("donne une couleur pleine et distincte à chaque canal du référentiel", () => {
    const colors = CONTACT_SOURCES.map((s) => sourceStyle(s.code).color);
    expect(new Set(colors).size).toBe(CONTACT_SOURCES.length);
    for (const s of CONTACT_SOURCES) {
      const style = sourceStyle(s.code);
      expect(style.hollow).toBe(false);
      expect(style.label).toBe(s.label);
      expect(style.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("affiche une pastille creuse « Non renseigné » pour un canal vide ou inconnu", () => {
    expect(sourceStyle(null)).toMatchObject({ code: "nc", label: "Non renseigné", hollow: true });
    expect(sourceStyle("inconnu")).toMatchObject({ code: "nc", hollow: true });
    expect(allSourceStyles().at(-1)?.code).toBe("nc");
    expect(allSourceStyles()).toHaveLength(CONTACT_SOURCES.length + 1);
  });

  it("compose l'infobulle avec la précision libre", () => {
    expect(sourceTitle("france_travail", " conseiller de Saint-Denis ")).toBe("Nous a contactés par : France Travail — conseiller de Saint-Denis");
    expect(sourceTitle("whatsapp")).toBe("Nous a contactés par : WhatsApp");
    expect(sourceTitle(null, "")).toBe("Nous a contactés par : Non renseigné");
  });
});

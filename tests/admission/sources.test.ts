import { describe, expect, it } from "vitest";
import { CONTACT_SOURCES } from "@/lib/referentiels";
import {
  FAMILIES,
  FAMILY_ORDER,
  allSourceStyles,
  familyOfChannel,
  matchesSourceFilter,
  resolveProvenance,
  sourceStyle,
} from "@/lib/admission/sources";

describe("provenance des apprenants — familles et pastilles", () => {
  it("chaque canal du référentiel appartient à une famille, avec la couleur de la famille", () => {
    for (const s of CONTACT_SOURCES) {
      const style = sourceStyle(s.code);
      expect(FAMILY_ORDER).toContain(style.family);
      expect(style.color).toBe(FAMILIES[style.family].color);
      expect(style.label).toBe(s.label);
    }
    expect(familyOfChannel("maison_de_quartier")).toBe("quartier");
    expect(familyOfChannel("whatsapp")).toBe("direct");
    expect(familyOfChannel("france_travail")).toBe("prescripteur");
    expect(familyOfChannel(null)).toBe("nc");
    // Les trois familles renseignées ont des couleurs pleines et distinctes
    const colors = ["quartier", "direct", "prescripteur"].map((f) => FAMILIES[f as keyof typeof FAMILIES].color);
    expect(new Set(colors).size).toBe(3);
    expect(FAMILIES.nc.hollow).toBe(true);
  });

  it("affiche une pastille creuse « Non renseigné » pour un canal vide ou inconnu", () => {
    expect(sourceStyle(null)).toMatchObject({ code: "nc", label: "Non renseigné", hollow: true });
    expect(sourceStyle("inconnu")).toMatchObject({ code: "nc", hollow: true });
    expect(allSourceStyles().at(-1)?.code).toBe("nc");
    expect(allSourceStyles()).toHaveLength(CONTACT_SOURCES.length + 1);
  });
});

describe("provenance des apprenants — déduction depuis le canal ou le prescripteur", () => {
  it("le canal « Nous a contactés par » prime, avec sa précision", () => {
    const p = resolveProvenance({ contact_source: "maison_de_quartier", contact_source_detail: " Landy ", prescriber: "France Travail" });
    expect(p).toMatchObject({ family: "quartier", channel: "maison_de_quartier", detail: "Landy", text: "Maison de quartier — Landy" });
    expect(p.title).toBe("Provenance : Maison de quartier · Maison de quartier — Landy");
    expect(resolveProvenance({ contact_source: "whatsapp" })).toMatchObject({ family: "direct", text: "WhatsApp", hollow: false });
  });

  it("à défaut, lit le prescripteur tel que l'équipe le tape déjà (MDQ, MDQ Landy, France Travail, asso…)", () => {
    expect(resolveProvenance({ prescriber: "MDQ" })).toMatchObject({ family: "quartier", channel: "maison_de_quartier", detail: null, text: "Maison de quartier" });
    expect(resolveProvenance({ prescriber: "MDQ Landy" })).toMatchObject({ family: "quartier", detail: "Landy", text: "Maison de quartier — Landy" });
    expect(resolveProvenance({ prescriber: "maison de quartier Pasteur" })).toMatchObject({ family: "quartier", detail: "Pasteur" });
    expect(resolveProvenance({ prescriber: "France travail" })).toMatchObject({ family: "prescripteur", channel: "france_travail" });
    expect(resolveProvenance({ prescriber: "Mission locale" })).toMatchObject({ family: "prescripteur", channel: "partenaire", detail: "Mission locale" });
    expect(resolveProvenance({ prescriber: "asso" })).toMatchObject({ family: "direct", channel: null, label: "Contact direct", detail: "asso" });
    expect(resolveProvenance({ prescriber: "réinscription" })).toMatchObject({ family: "direct" });
    expect(resolveProvenance({ prescriber: "Maria" })).toMatchObject({ family: "nc", detail: "Maria", hollow: true });
  });

  it("« Autre canal » seul reste non renseigné, mais un prescripteur MDQ le classe quand même", () => {
    expect(resolveProvenance({ contact_source: "autre" })).toMatchObject({ family: "nc", channel: "autre", label: "Autre canal" });
    expect(resolveProvenance({ contact_source: "autre", prescriber: "MDQ" })).toMatchObject({ family: "quartier" });
    expect(resolveProvenance({})).toMatchObject({ family: "nc", channel: null, text: "Non renseigné" });
    expect(resolveProvenance({}).title).toMatch(/non renseignée/);
  });

  it("filtre par famille (f:…) ou par canal", () => {
    const mdq = resolveProvenance({ prescriber: "MDQ Landy" });
    const wa = resolveProvenance({ contact_source: "whatsapp" });
    const vide = resolveProvenance({});
    expect(matchesSourceFilter(mdq, "f:quartier")).toBe(true);
    expect(matchesSourceFilter(mdq, "maison_de_quartier")).toBe(true);
    expect(matchesSourceFilter(mdq, "f:direct")).toBe(false);
    expect(matchesSourceFilter(wa, "f:direct")).toBe(true);
    expect(matchesSourceFilter(wa, "whatsapp")).toBe(true);
    expect(matchesSourceFilter(vide, "nc")).toBe(true);
    expect(matchesSourceFilter(vide, "f:nc")).toBe(true);
    expect(matchesSourceFilter(wa, null)).toBe(true);
  });
});

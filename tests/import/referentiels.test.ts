import { describe, expect, it } from "vitest";
import { ACTIVITIES, EDUCATION, GENDERS, LEVELS, DISTRICTS } from "@/lib/referentiels";
import { parseImportText } from "@/lib/learner-import";

// Le contrat anti-divergence : TOUTE valeur proposée par les menus déroulants du
// modèle Excel (générés depuis le référentiel) doit être comprise par l'import.
describe("référentiel unique — cohérence Excel ↔ import", () => {
  it("chaque libellé de Situation est reconnu et mappé sur son code", () => {
    for (const a of ACTIVITIES) {
      const [row] = parseImportText(`Test;Import;;;;;;;;;;${a.label};;;;;`);
      expect(row.activityStatus, a.label).toBe(a.code);
    }
  });

  it("chaque libellé de Scolarisation est reconnu", () => {
    for (const e of EDUCATION) {
      const [row] = parseImportText(`Test;Import;;;;;;;;;;;;;${e.label};;`);
      expect(row.educationLevel, e.label).toBe(e.code);
    }
  });

  it("chaque libellé de Sexe est reconnu (et les alias h/f/m aussi)", () => {
    for (const g of GENDERS) {
      const [row] = parseImportText(`Test;Import;;;;;;${g.label};;;;;;;;;`);
      expect(row.gender, g.label).toBe(g.code);
    }
    expect(parseImportText("Test;Import;;;;;;F;;;;;;;;;")[0].gender).toBe("femme");
  });

  it("les niveaux et quartiers passent tels quels (texte libre contrôlé par le menu)", () => {
    for (const level of LEVELS) {
      expect(parseImportText(`Test;Import;;;;${level};;;;;;;;;;;`)[0].levelAssessed).toBe(level);
    }
    for (const d of DISTRICTS) {
      expect(parseImportText(`Test;Import;;;;;;;;;;;;;;;${d}`)[0].district).toBe(d);
    }
  });

  it("une valeur hors menu devient « non renseigné » plutôt qu'une donnée fausse", () => {
    const [row] = parseImportText("Test;Import;;;;;;martien;;;;télétravail;;;doctorat;;");
    expect(row.gender).toBeNull();
    expect(row.activityStatus).toBeNull();
    expect(row.educationLevel).toBeNull();
  });
});

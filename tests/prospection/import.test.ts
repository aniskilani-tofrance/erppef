import { describe, expect, it } from "vitest";
import { emailFromCell, parseProspectImport, phoneFromCell } from "@/lib/prospection/import";

describe("prospection : import par collage depuis Excel", () => {
  it("lit le fichier « priorité 1 » sans en-têtes", () => {
    const rows = parseProspectImport(
      "LE CHIEN QUI FUME\tRestauration traditionnelle\t2026-01-01\t33 Rue DU PONT NEUF\t75001\tPARIS\t75\t+33 1 42 36 07 42\tcontact@auchienquifume.com\thttps://www.auchienquifume.com/\t51272319800051\n" +
        "KARMA\tRestauration rapide\t2026-01-01\t32 Rue PELLEPORT\t75020\tPARIS\t75\t+33 1 83 56 50 49\tadmin@e-mail.com\t\t99976884900013",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      company: "LE CHIEN QUI FUME", segment: "traditionnel", openedOn: "2026-01-01", postalCode: "75001", department: "75",
      phone: "+33142360742", email: "contact@auchienquifume.com", siret: "51272319800051",
    });
    expect(rows[1]).toMatchObject({ segment: "rapide_franchise", email: null, website: null });
  });

  it("lit le fichier complet avec en-têtes et écarte les restaurants fermés", () => {
    const rows = parseProspectImport(
      "Priorité POEI\tNom / enseigne\tRaison sociale\tType\tDate de création\tAdresse\tCP\tCommune\tDépt\tForme juridique\tEffectif\tSiège\tÉtat\tTéléphone\tE-mail\tSite web\tRéseaux\tSource du contact\tSIRET\n" +
        "1 – société employeuse\tCELINA\tCELINA SAS\tRestauration rapide\t2026-01-02\t37 Rue DE LA GAITE\t75014\tPARIS\t75\tSAS\t1 ou 2 salariés\toui\tActif\t\t\t\t\t\t10011491700014\n" +
        "—  fermé\tFERME\t\tRestauration rapide\t2026-02-02\t1 Rue X\t93200\tSAINT-DENIS\t93\tSAS\t\toui\tFermé\t\t\t\t\t\t10011491700099",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company: "CELINA", legalName: "CELINA SAS", phone: null, city: "PARIS", siret: "10011491700014" });
  });

  it("normalise les numéros et les e-mails", () => {
    expect(phoneFromCell("01 42 36 07 42")).toBe("+33142360742");
    expect(phoneFromCell("+331 46 30 35 64")).toBe("+33146303564");
    expect(phoneFromCell("")).toBeNull();
    expect(emailFromCell("jones@culinaries.fr, presse@culinaries.fr")).toBe("jones@culinaries.fr");
  });
});

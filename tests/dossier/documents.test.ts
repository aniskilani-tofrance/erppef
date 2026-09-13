import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SLOTS,
  checkDocumentFile,
  defaultLabel,
  documentExtension,
  documentStoragePath,
  dossierCompleteness,
  learnerDocumentsPrefix,
} from "@/lib/dossier/documents";

describe("dossier administratif — fichiers acceptés", () => {
  it("accepte photos et PDF jusqu'à 15 Mo, refuse le reste", () => {
    expect(checkDocumentFile({ type: "image/jpeg", size: 2_000_000, name: "IMG_0001.jpg" })).toBeNull();
    expect(checkDocumentFile({ type: "application/pdf", size: 900_000, name: "scan.pdf" })).toBeNull();
    // iPhone : type parfois vide, on se rabat sur l'extension
    expect(checkDocumentFile({ type: "", size: 500_000, name: "photo.HEIC" })).toBeNull();
    expect(checkDocumentFile({ type: "application/msword", size: 1000, name: "cv.doc" })).toMatch(/Format non accepté/);
    expect(checkDocumentFile({ type: "image/png", size: 0, name: "vide.png" })).toMatch(/vide/);
    expect(checkDocumentFile({ type: "image/png", size: 16 * 1024 * 1024, name: "gros.png" })).toMatch(/15 Mo/);
  });

  it("déduit l'extension du type MIME avant le nom", () => {
    expect(documentExtension({ type: "image/jpeg", name: "x.jpeg" })).toBe("jpg");
    expect(documentExtension({ type: "application/pdf", name: "x" })).toBe("pdf");
    expect(documentExtension({ type: "", name: "scan.JPEG" })).toBe("jpg");
    expect(documentExtension({ type: "", name: "sansext" })).toBe("bin");
  });
});

describe("dossier administratif — chemins et avancement", () => {
  it("range chaque pièce sous l'organisme puis l'apprenant (RLS par préfixe)", () => {
    const path = documentStoragePath("org1", "learn1", "identite_recto", "jpg", "abc");
    expect(path).toBe("org1/apprenants/learn1/identite_recto-abc.jpg");
    expect(path.startsWith(learnerDocumentsPrefix("org1", "learn1") + "/")).toBe(true);
  });

  it("compte les trois pièces attendues, sans les documents « autre »", () => {
    expect(dossierCompleteness([])).toMatchObject({ done: 0, total: 3 });
    const partial = dossierCompleteness([{ kind: "identite_recto" }, { kind: "autre" }]);
    expect(partial.done).toBe(1);
    expect(partial.missing.map((s) => s.kind)).toEqual(["identite_verso", "justificatif_domicile"]);
    expect(dossierCompleteness(DOCUMENT_SLOTS.map((s) => ({ kind: s.kind }))).done).toBe(3);
  });

  it("donne un libellé parlant même après un scan nommé IMG_1234", () => {
    expect(defaultLabel("identite_recto", "IMG_1234.jpg")).toBe("Pièce d'identité — recto");
    expect(defaultLabel("autre", "titre_de-sejour.pdf")).toBe("titre de sejour");
    expect(defaultLabel("autre", ".pdf")).toBe("Document");
  });
});

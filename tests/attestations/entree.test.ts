import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildEntryAttestationsPdf,
  entryAttestationFileName,
  firstPresenceByLearner,
  type EntryAttestation,
} from "@/lib/attestations/entree";

const sample = (over: Partial<EntryAttestation> = {}): EntryAttestation => ({
  learnerId: "l1",
  learnerRef: "A-0123",
  learnerName: "Charlène Kiese",
  birthDate: "1990-03-14",
  gender: "femme",
  email: "c@exemple.invalid",
  groupName: "Cours municipaux A2 — Landy",
  programName: "FLE A2 — vie quotidienne et emploi",
  level: "A2",
  schedule: "mardi 13h-17h, jeudi 13h-17h",
  place: "Maison de quartier Landy — 37 rue du Landy, 93400 Saint-Ouen-sur-Seine",
  plannedStart: "2026-10-06",
  plannedEnd: "2027-06-29",
  plannedHours: 240,
  entryOn: "2026-10-06",
  funderName: "Ville de Saint-Ouen",
  ...over,
});

describe("Attestation d'entrée en formation", () => {
  it("retient la première présence émargée, jamais une absence ni une feuille non clôturée", () => {
    const first = firstPresenceByLearner([
      { learnerId: "a", status: "absent", startsAt: "2026-10-05T07:00:00Z", closed: true },
      { learnerId: "a", status: "present", startsAt: "2026-10-08T07:00:00Z", closed: true },
      { learnerId: "a", status: "retard", startsAt: "2026-10-06T07:00:00Z", closed: true },
      { learnerId: "b", status: "present", startsAt: "2026-10-05T07:00:00Z", closed: false },
      { learnerId: "c", status: "absent", startsAt: "2026-10-05T07:00:00Z", closed: true },
    ]);
    expect(first.get("a")).toBe("2026-10-06");
    expect(first.has("b")).toBe(false);
    expect(first.has("c")).toBe(false);
  });

  it("date d'entrée à l'heure de Paris (séance tardive en UTC)", () => {
    const first = firstPresenceByLearner([{ learnerId: "a", status: "present", startsAt: "2026-10-06T22:30:00Z", closed: true }]);
    expect(first.get("a")).toBe("2026-10-07");
  });

  it("une page par apprenant, même avec des champs manquants", async () => {
    const pdf = await buildEntryAttestationsPdf([
      sample(),
      sample({ learnerId: "l2", learnerName: "Zahra Belhit", birthDate: null, funderName: null, programName: null, place: null, plannedHours: 0 }),
    ]);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
  });

  it("noms de fichier lisibles", () => {
    expect(entryAttestationFileName("Cours municipaux A2 — Landy")).toMatch(/^attestations_entree_.*\.pdf$/);
    expect(entryAttestationFileName("Cours municipaux A2 — Landy", "Charlène Kiese")).toMatch(/^attestation_entree_Charlene-Kiese_.*\.pdf$/);
  });
});

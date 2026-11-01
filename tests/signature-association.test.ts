import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { associationSignaturePath, loadAssociationSignature } from "@/lib/signature-association";
import { buildMembershipReceiptPdf, buildSignedDocumentPdf } from "@/lib/documents-apprenant/pdf";
import { contratText, learnerIdentityLines } from "@/lib/documents-apprenant/textes";
import { buildEntryAttestationsPdf } from "@/lib/attestations/entree";
import { ORG, OTHER_ORG, fakeClient, newDb, pdfText } from "./documents-apprenant/fake-supabase";

// Signature du président + cachet : image PNG du stockage privé, posée sur les documents de
// l'association. Ici un pixel PNG de test : la vraie image n'entre jamais dans le dépôt.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const STAMP = new Uint8Array(PIXEL);

async function imageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")).length;
}

const identity = learnerIdentityLines({ firstName: "Prénom", lastName: "Exemple", birthDate: null, gender: null, address: null, postalCode: null, city: null, phone: null, email: null, ref: "A-0001" });
const proof = { docId: "d", signerName: "Prénom Exemple", signedAt: "2026-11-01T10:00:00Z", channel: "sur_place" as const, ip: null, userAgent: null, signaturePng: `data:image/png;base64,${PIXEL.toString("base64")}` };
const group = { name: "PEF A1", programName: "PEF A1", level: "A1", entryLevel: "A1", kind: "cours" as const, startsOn: "2026-10-05", endsOn: "2027-06-14", totalHours: 300, schedule: "lundi 9h30-12h30", place: "Saint-Ouen", capacity: 15, trainerName: null, priceEuros: 0 };
const attestation = {
  learnerId: "l1", learnerRef: "A-0001", learnerName: "Prénom Exemple", birthDate: null, gender: null, email: null, groupName: "PEF A1",
  programName: null, level: "A1", schedule: "lundi 9h30-12h30", place: null, plannedStart: null, plannedEnd: null, plannedHours: 0, entryOn: "2026-10-05", funderName: null,
};

describe("rangement de l'image", () => {
  it("hors du dossier de l'organisme : aucune politique de stockage ne l'ouvre aux comptes", () => {
    const [first, ...rest] = associationSignaturePath(ORG).split("/");
    expect(first).toBe("association");
    expect(first).not.toBe(ORG);
    expect(rest).toEqual([ORG, "signature-cachet.png"]);
  });

  it("lit l'image de l'organisme, jamais celle d'un autre ; absente ou panne : null", async () => {
    const db = newDb();
    db.files.set(`dossiers/${associationSignaturePath(ORG)}`, STAMP);
    const admin = fakeClient(db) as unknown as SupabaseClient;
    expect(await loadAssociationSignature(admin, ORG)).toEqual(STAMP);
    expect(await loadAssociationSignature(admin, OTHER_ORG)).toBeNull();
    const broken = { storage: { from: () => ({ download: async () => { throw new Error("réseau"); } }) } } as unknown as SupabaseClient;
    expect(await loadAssociationSignature(broken, ORG)).toBeNull();
  });
});

describe("posée sur les documents de l'association", () => {
  it("contrat signé : image dans « Pour l'association » à la place de la mention écrite", async () => {
    const without = await buildSignedDocumentPdf({ text: contratText(group), identity, proof });
    const withStamp = await buildSignedDocumentPdf({ text: contratText(group), identity, proof, associationSignature: STAMP });
    expect(await imageCount(withStamp)).toBeGreaterThan(await imageCount(without));
    expect(await pdfText(without)).toContain("Document émis par l'association");
    expect(await pdfText(withStamp)).not.toContain("Document émis par l'association");
  });

  it("reçu de cotisation et attestation d'entrée : image au-dessus de « Signature et cachet »", async () => {
    const receipt = { receiptNo: "ADH-2026-0001", learnerName: "Prénom Exemple", identity, year: 2026, amountCents: 4000, paidOn: "2026-11-12", method: "especes" as const };
    expect(await imageCount(await buildMembershipReceiptPdf({ ...receipt, associationSignature: STAMP }))).toBeGreaterThan(await imageCount(await buildMembershipReceiptPdf(receipt)));
    const day = new Date("2026-11-12T10:00:00Z");
    const signed = await buildEntryAttestationsPdf([attestation], day, STAMP);
    expect(await imageCount(signed)).toBeGreaterThan(await imageCount(await buildEntryAttestationsPdf([attestation], day)));
    expect(await pdfText(signed)).toContain("Signature et cachet");
  });

  it("image illisible : le document sort quand même, sans image ajoutée", async () => {
    const bad = new Uint8Array([1, 2, 3]);
    const day = new Date("2026-11-12T10:00:00Z");
    expect(await imageCount(await buildEntryAttestationsPdf([attestation], day, bad))).toBe(await imageCount(await buildEntryAttestationsPdf([attestation], day)));
  });
});

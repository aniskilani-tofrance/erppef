import { describe, expect, it } from "vitest";
import { buildAttendancePdf, sheetExcuseNote, sheetFileName, sheetStatusLabel, type AttendanceSheetData } from "@/lib/emargement/pdf";
import { certificateAbsenceLine } from "@/lib/emargement/certificat";

// PNG 1×1 valide : suffit à vérifier l'incrustation des signatures.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const DATA: AttendanceSheetData = {
  groupName: "PEF A1 — Été 2026",
  programName: "PEF A1",
  trainerName: "Marie Dupont",
  roomName: "Salle 12",
  startsAt: "2026-07-06T07:00:00.000Z", // 09:00 Paris
  endsAt: "2026-07-06T10:00:00.000Z",
  closedAt: "2026-07-06T10:05:00.000Z",
  trainerSignature: TINY_PNG,
  rows: [
    { name: "Ahmed Karimi", status: "present", signedAt: "2026-07-06T07:04:00.000Z", signature: TINY_PNG },
    { name: "Olena Kovalenko", status: "retard", signedAt: "2026-07-06T07:35:00.000Z", signature: TINY_PNG },
    { name: "Mamadou Diallo", status: "absent", signedAt: null, signature: null },
  ],
};

describe("buildAttendancePdf", () => {
  it("génère un PDF valide avec signatures incrustées", async () => {
    const pdf = await buildAttendancePdf(DATA);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("pagine au-delà d'une page de tableau", async () => {
    const many = {
      ...DATA,
      rows: Array.from({ length: 40 }, (_, i) => ({
        name: `Apprenant ${i + 1}`,
        status: "present",
        signedAt: "2026-07-06T07:04:00.000Z",
        signature: TINY_PNG,
      })),
    };
    const pdf = await buildAttendancePdf(many);
    expect(pdf.length).toBeGreaterThan(4000);
  });

  it("nomme le fichier avec la date locale et le groupe translittéré", () => {
    expect(sheetFileName(DATA)).toBe("emargement_2026-07-06_PEF-A1-Ete-2026.pdf");
  });
});

describe("feuille PDF — statut « Excusé »", () => {
  it("libellé « Excusé » et mention sous le tableau, sans jamais le motif", async () => {
    expect(sheetStatusLabel("excuse")).toBe("Excusé");
    expect(sheetStatusLabel("absent")).toBe("Absent");
    expect(sheetExcuseNote(DATA.rows)).toBeNull();
    const rows = [...DATA.rows, { name: "Fatima Benali", status: "excuse", signedAt: null, signature: null }];
    expect(sheetExcuseNote(rows)).toContain("absence justifiée");
    const pdf = await buildAttendancePdf({ ...DATA, rows });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});

describe("certificat de réalisation — absences justifiées", () => {
  it("ligne « dont X absences justifiées » seulement s'il y en a", () => {
    expect(certificateAbsenceLine({ sessionsAttended: 8, sessionsTotal: 10, sessionsExcused: 0 })).toBeNull();
    expect(certificateAbsenceLine({ sessionsAttended: 8, sessionsTotal: 10 })).toBeNull();
    expect(certificateAbsenceLine({ sessionsAttended: 8, sessionsTotal: 10, sessionsExcused: 1 })).toBe(
      "2 absences, dont 1 absence justifiée : non comptées dans la durée réalisée.",
    );
  });
});

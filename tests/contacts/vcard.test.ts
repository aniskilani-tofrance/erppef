import { describe, expect, it } from "vitest";
import {
  buildVCard,
  buildVcf,
  canExportContacts,
  foldLine,
  internationalPhone,
  selectContacts,
  vcfFileName,
  type GroupMember,
} from "@/lib/contacts/vcard";

const m = (id: string, over: Partial<GroupMember> = {}): GroupMember => ({
  learnerId: id,
  firstName: "Awa",
  lastName: "DIALLO",
  learnerNo: 126,
  phone: "06 12 34 56 78",
  status: "inscrit",
  ...over,
});
const group = { name: "A1 Cordon, mardi; jeudi", groupNo: 5 };

describe("numéros", () => {
  it("passe au format international", () => {
    expect(internationalPhone("06 12 34 56 78")).toBe("+33612345678");
    expect(internationalPhone("+93 70 123 4567")).toBe("+93701234567");
    expect(internationalPhone("0033 7 12 34 56 78")).toBe("+33712345678");
    expect(internationalPhone("12")).toBeNull();
    expect(internationalPhone(null)).toBeNull();
  });
});

describe("sélection des contacts", () => {
  const members = [
    m("a", { lastName: "BA" }),
    m("b", { lastName: "CISSE", phone: null }),
    m("c", { lastName: "DIOP" }),
    m("d", { lastName: "FALL", status: "abandon" }),
  ];

  it("tout le groupe : inscrits avec numéro, par nom ; sans numéro listés à part", () => {
    const s = selectContacts(members, new Set(), "tout");
    expect(s.toExport.map((x) => x.learnerId)).toEqual(["a", "c"]);
    expect(s.noPhone.map((x) => x.learnerId)).toEqual(["b"]);
    expect(s.newCount).toBe(2);
    expect(s.toRemove).toEqual([]);
  });

  it("nouveaux : seulement ceux jamais importés ; départs à retirer", () => {
    const s = selectContacts(members, new Set(["a", "d"]), "nouveaux");
    expect(s.toExport.map((x) => x.learnerId)).toEqual(["c"]);
    expect(s.newCount).toBe(1);
    expect(s.toRemove.map((x) => x.learnerId)).toEqual(["d"]);
  });
});

describe("fichier vCard", () => {
  it("une fiche lisible et échappée", () => {
    const card = buildVCard(m("11111111-1111-1111-1111-111111111111"), group, "12/10/2026");
    expect(card).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n");
    expect(card).toContain("N:DIALLO;Awa;;;");
    expect(card).toContain("FN:Awa DIALLO · G-5");
    expect(card).toContain("ORG:ParlerEmploi Formation;A1 Cordon\\, mardi\; jeudi");
    expect(card).toContain("TEL;TYPE=CELL:+33612345678");
    expect(card).toContain("A-0126");
    expect(card).toContain("UID:urn:uuid:11111111-1111-1111-1111-111111111111");
    expect(card.endsWith("END:VCARD")).toBe(true);
  });

  it("plusieurs fiches à la suite, CRLF final", () => {
    const vcf = buildVcf([m("a"), m("b")], group, "12/10/2026");
    expect(vcf.match(/BEGIN:VCARD/g)?.length).toBe(2);
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("replie les lignes longues sans couper un caractère accentué", () => {
    const line = `NOTE:${"é".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
  });

  it("nom de fichier", () => {
    expect(vcfFileName(group, "tout")).toBe("contacts-g-5.vcf");
    expect(vcfFileName({ name: "Atelier lecture-écriture", groupNo: null }, "nouveaux")).toBe("contacts-atelier-lecture-ecriture-nouveaux.vcf");
  });
});

describe("droit de télécharger", () => {
  const base = { groupId: "g1", myTrainerId: null, groupTrainerIds: ["t1", "t2"], myInternGroupIds: [] as string[] };
  it("équipe partout, formatrice de ses groupes (co-animation comprise), stagiaire rattaché", () => {
    expect(canExportContacts({ ...base, role: "admin" })).toBe(true);
    expect(canExportContacts({ ...base, role: "coordinator" })).toBe(true);
    expect(canExportContacts({ ...base, role: "trainer", myTrainerId: "t2" })).toBe(true);
    expect(canExportContacts({ ...base, role: "trainer", myTrainerId: "t9" })).toBe(false);
    expect(canExportContacts({ ...base, role: "trainer", myTrainerId: null })).toBe(false);
    expect(canExportContacts({ ...base, role: "stagiaire", myInternGroupIds: ["g1"] })).toBe(true);
    expect(canExportContacts({ ...base, role: "stagiaire", myInternGroupIds: ["g2"] })).toBe(false);
    expect(canExportContacts({ ...base, role: "viewer" })).toBe(false);
    expect(canExportContacts({ ...base, role: "setter" })).toBe(false);
  });
});

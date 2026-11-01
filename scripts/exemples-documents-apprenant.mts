// Exemples à relire AVANT la mise en ligne : les trois textes (Markdown) et un PDF signé de
// chaque document, plus un reçu de cotisation, remplis avec des données FICTIVES
// (« Prénom Exemple »). Mêmes fonctions que l'ERP : ce qui est ici est ce qui sera signé.
// Aucune base, aucun réseau. Lancer depuis la racine du dépôt :
//   JITI_ALIAS="{\"@\": \"$PWD/src\"}" npx jiti scripts/exemples-documents-apprenant.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const { adhesionText, contratText, documentMarkdown, learnerIdentityLines, reglementText } = await import("../src/lib/documents-apprenant/textes");
const { buildMembershipReceiptPdf, buildSignedDocumentPdf } = await import("../src/lib/documents-apprenant/pdf");

const OUT = "docs/documents-apprenant";
mkdirSync(OUT, { recursive: true });

// Signature fictive : un trait ondulé dessiné pixel par pixel, encodé en PNG (sans canvas).
function scribblePng(width = 360, height = 120): string {
  const px = new Uint8Array(width * height * 4); // transparent
  const dot = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const xx = Math.round(x + dx), yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const i = (yy * width + xx) * 4;
        px.set([30, 41, 59, 255], i);
      }
  };
  for (let t = 0; t <= 1; t += 0.0004) {
    const x = 20 + t * (width - 40);
    const y = height / 2 + Math.sin(t * 19) * 26 * (1 - t * 0.5) + Math.cos(t * 7) * 10;
    dot(x, y);
  }
  for (let t = 0; t <= 1; t += 0.002) dot(60 + t * 240, height - 22 + Math.sin(t * 3) * 3); // soulignement
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const learner = {
  firstName: "Prénom",
  lastName: "Exemple",
  birthDate: "1990-03-14",
  gender: "femme",
  address: "1 rue de l'Exemple",
  postalCode: "93400",
  city: "Saint-Ouen-sur-Seine",
  phone: "06 00 00 00 00",
  email: null,
  ref: "A-0000",
};
// Groupe d'exemple : comme « PEF A1 — 2026-27 » (dates, horaires et salle fictifs mais plausibles).
const group = {
  name: "PEF A1 — 2026-27",
  programName: "PEF A1",
  level: "A2",
  entryLevel: "A1",
  kind: "cours" as const,
  startsOn: "2026-10-05",
  endsOn: "2027-06-14",
  totalHours: 300,
  schedule: "lundi 9h30-12h30, jeudi 9h30-12h30",
  place: "Salle 12 — 14 rue Alexandre Bachelet, 93400 Saint-Ouen-sur-Seine",
  capacity: 15,
  trainerName: "Formatrice Exemple",
  priceEuros: 0,
};
const year = 2026;
const identity = learnerIdentityLines(learner);
const signedAt = "2026-11-02T09:41:00.000Z";
const signature = scribblePng();
const proof = (docId: string) => ({ docId, signerName: "Prénom Exemple", signedAt, channel: "lien" as const, ip: "203.0.113.10 (exemple)", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) — exemple", signaturePng: signature });

const docs = [
  { file: "1-bulletin-adhesion", text: adhesionText(year), membership: { year, amountCents: 4000 } },
  { file: "2-contrat-formation", text: contratText(group), membership: null },
  { file: "3-reglement-interieur", text: reglementText(), membership: null },
];
for (const [i, d] of docs.entries()) {
  writeFileSync(`${OUT}/${d.file}.md`, documentMarkdown(d.text));
  const pdf = await buildSignedDocumentPdf({ text: d.text, identity, membership: d.membership, proof: proof(`00000000-0000-4000-8000-00000000000${i + 1}`) });
  writeFileSync(`${OUT}/exemple-${d.file}.pdf`, pdf);
}
writeFileSync(
  `${OUT}/exemple-4-recu-cotisation.pdf`,
  await buildMembershipReceiptPdf({ receiptNo: "ADH-2026-0000", learnerName: "Prénom Exemple", identity, year, amountCents: 4000, paidOn: "2026-11-16", method: "especes", issuedOn: new Date("2026-11-16T10:00:00Z") }),
);
console.log(`Exemples écrits dans ${OUT}/`);

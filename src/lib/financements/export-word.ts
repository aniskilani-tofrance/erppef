import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { countChars } from "./atelier";

// Export Word d'un dossier (lot 2), à la charte ParlerEmploi : pour la relecture à deux et
// l'archive dans le Drive. Le dépôt, lui, se fait rubrique par rubrique avec « Copier ».

const TEAL = "00504E"; // vert canard : titres
const GREEN = "32CF8A"; // vert vif : accents
const INK = "0E271B"; // encre : texte
const MUTED = "5B6B63";
const TITLE_FONT = "Outfit";
const BODY_FONT = "DM Sans";

export type ExportInput = {
  orgName: string;
  title: string;
  funderName: string | null;
  deadline: string | null; // déjà mise en forme
  amountRequested: string | null; // déjà mis en forme
  sections: { title: string; content: string; max_chars: number | null }[];
  generatedOn: string; // « 18 novembre 2026 »
};

// Un paragraphe du texte par ligne ; une ligne « - … » devient une puce.
function bodyParagraphs(content: string): Paragraph[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: Paragraph[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const bullet = /^\s*[-•–]\s+(.*)$/.exec(line);
    out.push(
      new Paragraph({
        bullet: bullet ? { level: 0 } : undefined,
        spacing: { after: 120, line: 300 },
        children: [new TextRun({ text: bullet ? bullet[1] : line.trim(), font: BODY_FONT, size: 22, color: INK })],
      }),
    );
  }
  return out;
}

export function exportFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `dossier-${slug || "financement"}.docx`;
}

export function buildApplicationDocument(input: ExportInput): Document {
  const meta = [
    input.funderName ? `Financeur : ${input.funderName}` : null,
    input.deadline ? `Date limite de dépôt : ${input.deadline}` : null,
    input.amountRequested ? `Montant demandé : ${input.amountRequested}` : null,
  ].filter((x): x is string => !!x);

  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: input.orgName.toUpperCase(), font: TITLE_FONT, size: 18, color: GREEN, bold: true })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 160 },
      children: [new TextRun({ text: input.title, font: TITLE_FONT, size: 40, color: TEAL, bold: true })],
    }),
    ...meta.map(
      (m) =>
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: m, font: BODY_FONT, size: 20, color: MUTED })],
        }),
    ),
    new Paragraph({
      spacing: { before: 80, after: 320 },
      border: { bottom: { color: GREEN, space: 6, style: "single", size: 12 } },
      children: [new TextRun({ text: `Version de travail du ${input.generatedOn} — à relire avant dépôt`, font: BODY_FONT, size: 18, color: MUTED, italics: true })],
    }),
  ];

  for (const s of input.sections) {
    const chars = countChars(s.content);
    const over = !!s.max_chars && chars > s.max_chars;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 60 },
        keepNext: true,
        children: [new TextRun({ text: s.title, font: TITLE_FONT, size: 28, color: TEAL, bold: true })],
      }),
      new Paragraph({
        spacing: { after: 140 },
        keepNext: true,
        children: [
          new TextRun({
            text: s.content.trim()
              ? `${chars.toLocaleString("fr-FR")} caractères${s.max_chars ? ` sur ${s.max_chars.toLocaleString("fr-FR")}` : ""}${over ? " — dépasse la limite" : ""}`
              : "À rédiger",
            font: BODY_FONT,
            size: 16,
            color: over ? "B91C1C" : MUTED,
          }),
        ],
      }),
      ...bodyParagraphs(s.content),
    );
  }

  return new Document({
    creator: input.orgName,
    title: input.title,
    styles: { default: { document: { run: { font: BODY_FONT, size: 22, color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, // 2 cm
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${input.orgName} — ${input.title} — page `, font: BODY_FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function buildApplicationDocx(input: ExportInput): Promise<Buffer> {
  return Packer.toBuffer(buildApplicationDocument(input));
}

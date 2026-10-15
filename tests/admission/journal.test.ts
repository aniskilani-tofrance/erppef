import { describe, expect, it } from "vitest";
import { buildJournal, lastContactAt } from "@/lib/admission/journal";
import { channelLabel, isInternalNote } from "@/lib/admission/status";

const NO_MILESTONES = {
  entryInterviewOn: null,
  entryNeed: null,
  oralTestOn: null,
  oralTestLevel: null,
  oralTestEvaluator: null,
  oralTestComment: null,
};

describe("fil « Notes et échanges »", () => {
  it("distingue les notes internes des contacts", () => {
    expect(isInternalNote("note")).toBe(true);
    expect(isInternalNote("whatsapp")).toBe(false);
    expect(channelLabel("note")).toBe("Note interne");
    const entries = buildJournal(
      [
        { id: "a", contacted_at: "2026-10-14T09:00:00Z", channel: "note", outcome: "autre", note: " Préfère le matin ", by_name: "Marie" },
        { id: "b", contacted_at: "2026-10-13T09:00:00Z", channel: "whatsapp", outcome: "joint", note: null, by_name: null },
      ],
      NO_MILESTONES,
    );
    expect(entries.map((e) => [e.kind, e.title])).toEqual([
      ["note", "Note interne"],
      ["contact", "WhatsApp · Joint — échange fait"],
    ]);
    expect(entries[0].text).toBe("Préfère le matin");
    expect(entries[0].by).toBe("Marie");
  });

  it("insère les entretiens de la fiche à leur date, du plus récent au plus ancien", () => {
    const entries = buildJournal(
      [
        { id: "c1", contacted_at: "2026-10-10T08:00:00Z", channel: "telephone", outcome: "convoque", note: null },
        { id: "c2", contacted_at: "2026-10-01T08:00:00Z", channel: "whatsapp", outcome: "message_envoye", note: null },
      ],
      {
        entryInterviewOn: "2026-10-05",
        entryNeed: "Parler à l'école des enfants",
        oralTestOn: "2026-10-05",
        oralTestLevel: "A1",
        oralTestEvaluator: "Sabrina",
        oralTestComment: "Comprend les questions simples",
      },
    );
    expect(entries.map((e) => e.id)).toEqual(["c1", "repere-entretien-entree", "repere-entretien-oral", "c2"]);
    const oral = entries.find((e) => e.id === "repere-entretien-oral")!;
    expect(oral.title).toBe("Entretien oral · A1");
    expect(oral.text).toBe("Comprend les questions simples");
    expect(oral.by).toBe("Sabrina");
    expect(oral.dayOnly).toBe(true);
  });

  it("le dernier contact ignore les notes internes", () => {
    const rows = [
      { contacted_at: "2026-10-14T09:00:00Z", channel: "note" },
      { contacted_at: "2026-10-12T09:00:00Z", channel: "telephone" },
    ];
    expect(lastContactAt(rows)).toBe("2026-10-12T09:00:00Z");
    expect(lastContactAt([{ contacted_at: "2026-10-14T09:00:00Z", channel: "note" }])).toBeNull();
  });
});

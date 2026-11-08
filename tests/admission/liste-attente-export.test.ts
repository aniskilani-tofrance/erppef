import { describe, expect, it } from "vitest";
import { WAITLIST_COLUMNS, buildWaitlistCsv, waitlistFileName, type WaitlistLearner } from "@/lib/admission/waitlist-export";

const learner = (over: Partial<WaitlistLearner>): WaitlistLearner => ({
  id: "x",
  first_name: "Prénom",
  last_name: "Exemple",
  learner_no: 1,
  phone: null,
  email: null,
  level_assessed: null,
  created_at: "2026-10-01T10:00:00Z",
  contact_source: null,
  contact_source_detail: null,
  prescriber: null,
  ...over,
});

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("liste d'attente → tableur", () => {
  it("en-tête, BOM pour Excel, ordre d'arrivée et rang", () => {
    const csv = buildWaitlistCsv(
      [
        learner({ id: "b", first_name: "Bao", learner_no: 12, created_at: "2026-10-20T09:00:00Z" }),
        learner({ id: "a", first_name: "Awa", learner_no: 7, created_at: "2026-10-03T09:00:00Z", phone: "+33612345678", level_assessed: "A1" }),
      ],
      [],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const [head, first, second] = lines(csv);
    expect(head).toBe(WAITLIST_COLUMNS.join(";"));
    expect(first.split(";").slice(0, 8)).toEqual(["1", "A-0007", "Awa", "Exemple", "06 12 34 56 78", "", "A1", "03/10/2026"]);
    expect(second.split(";").slice(0, 3)).toEqual(["2", "A-0012", "Bao"]);
  });

  it("motif = dernier contact qui porte un motif de liste d'attente ; dernier contact = le plus récent", () => {
    const csv = buildWaitlistCsv(
      [learner({ id: "a" })],
      [
        { learner_id: "a", contacted_at: "2026-10-10T08:00:00Z", reason: "horaire_incompatible" },
        { learner_id: "a", contacted_at: "2026-10-25T08:00:00Z", reason: null },
        { learner_id: "a", contacted_at: "2026-10-05T08:00:00Z", reason: "garde_enfant" },
        { learner_id: "a", contacted_at: "2026-10-12T08:00:00Z", reason: "plus_interesse" }, // motif de « sans suite » : ignoré
      ],
    );
    const cols = lines(csv)[1].split(";");
    expect(cols[9]).toBe("25/10/2026");
    expect(cols[8]).toBe("Horaires incompatibles"); // le plus récent qui porte un motif de liste d'attente
  });

  it("sans contact : motif « non renseigné », dernier contact vide, provenance lisible", () => {
    const cols = lines(buildWaitlistCsv([learner({ id: "a", prescriber: "MDQ Landy" })], []))[1].split(";");
    expect(cols[8]).toBe("non renseigné");
    expect(cols[9]).toBe("");
    expect(cols[10]).toContain("Landy");
  });

  it("protège le tableur : point-virgule entre guillemets, formule neutralisée, pas de retour à la ligne", () => {
    const csv = buildWaitlistCsv([learner({ id: "a", first_name: "=HYPERLINK(\"x\")", last_name: "Ben; Ali", email: "a@b.fr\nc" })], []);
    const row = lines(csv)[1];
    expect(lines(csv)).toHaveLength(2);
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('"Ben; Ali"');
    expect(row).toContain("a@b.fr c");
  });

  it("liste vide : seulement l'en-tête ; nom de fichier daté (heure de Paris)", () => {
    expect(lines(buildWaitlistCsv([], []))).toEqual([WAITLIST_COLUMNS.join(";")]);
    expect(waitlistFileName(new Date("2026-11-08T23:30:00Z"))).toBe("liste-attente_2026-11-09.csv");
  });
});

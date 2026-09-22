import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTRY_FIELDS,
  ficheSchema,
  monthlyNoteSchema,
  normalizeCode,
  normalizeMonthlyNoteBody,
  normalizeRunBody,
  parseFields,
  parseFromDate,
  runSchema,
  toRow,
  validateBatch,
} from "@/lib/veille/schema";

const LOT = JSON.parse(readFileSync("docs/integrations/veille-lot-test-8.json", "utf8")) as { run_id: string; fiches: Record<string, unknown>[] };
const clone = () => JSON.parse(JSON.stringify(LOT)) as typeof LOT;

describe("API de veille — validation des fiches", () => {
  it("le lot de test à huit fiches est accepté tel quel", () => {
    const v = validateBatch(clone());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.runId).toBe("test-lot8");
    expect(v.fiches).toHaveLength(8);
    expect(v.fiches.map((f) => f.indicateur)).toEqual([23, 23, 24, 24, 25, 25, 26, 26]);
    expect(v.fiches.every((f) => f.statut === "a_valider")).toBe(true);
  });

  it("« à valider », « A VALIDER » et « a_valider » sont le même statut ; tout autre statut est refusé", () => {
    expect(normalizeCode("à valider")).toBe("a_valider");
    expect(normalizeCode("A VALIDER")).toBe("a_valider");
    const ok = ficheSchema.safeParse({ ...LOT.fiches[0], statut: "a_valider" });
    expect(ok.success).toBe(true);
    const ko = ficheSchema.safeParse({ ...LOT.fiches[0], statut: "validée" });
    expect(ko.success).toBe(false);
  });

  it("indicateur hors 23-26 → rejet ciblé sur le champ", () => {
    const lot = clone();
    lot.fiches[3].indicateur = 27;
    const v = validateBatch(lot);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.status).toBe(422);
    expect(v.rejetees).toHaveLength(1);
    expect(v.rejetees[0].index).toBe(3);
    expect(v.rejetees[0].dedupe_key).toBe("test:lot8:04");
    expect(v.rejetees[0].erreurs[0].champ).toBe("indicateur");
    expect(v.recues).toBe(8);
  });

  it("l'indicateur accepte une chaîne numérique, la catégorie tolère la casse et les accents", () => {
    const r = ficheSchema.safeParse({ ...LOT.fiches[0], indicateur: "24", categorie: "Légale" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.indicateur).toBe(24);
    expect(r.data.categorie).toBe("legale");
  });

  it("catégorie inconnue, URL non http(s), dates incohérentes, alerte non booléenne → rejets", () => {
    const bad = (patch: Record<string, unknown>) => ficheSchema.safeParse({ ...LOT.fiches[0], ...patch }).success;
    expect(bad({ categorie: "juridique" })).toBe(false);
    expect(bad({ url: "ftp://exemple.fr/x" })).toBe(false);
    expect(bad({ url: "pas une url" })).toBe(false);
    expect(bad({ date_publication: "2026-09-30", date_collecte: "2026-09-21" })).toBe(false);
    expect(bad({ date_collecte: "2099-01-01" })).toBe(false);
    expect(bad({ date_collecte: "2026-02-30" })).toBe(false);
    expect(bad({ alerte: "oui" })).toBe(false);
    expect(bad({ titre: "" })).toBe(false);
    expect(bad({ dedupe_key: "abc" })).toBe(false);
    expect(bad({ dedupe_key: "clé avec espaces" })).toBe(false);
  });

  it("impact et exploitation peuvent être vides mais doivent être présents", () => {
    expect(ficheSchema.safeParse({ ...LOT.fiches[0], impact_parleremploi: "", exploitation_proposee: "" }).success).toBe(true);
    const sans = { ...LOT.fiches[0] } as Record<string, unknown>;
    delete sans.impact_parleremploi;
    expect(ficheSchema.safeParse(sans).success).toBe(false);
  });

  it("dedupe_key en double dans le lot → rejet du lot entier", () => {
    const lot = clone();
    lot.fiches[5].dedupe_key = "test:lot8:02";
    const v = validateBatch(lot);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.status).toBe(422);
    expect(v.rejetees[0].index).toBe(5);
    expect(v.rejetees[0].erreurs[0].champ).toBe("dedupe_key");
  });

  it("run_id d'une fiche différent du lot → rejet ; identique → accepté", () => {
    const lot = clone();
    lot.fiches[0].run_id = "autre-run";
    expect(validateBatch(lot).ok).toBe(false);
    lot.fiches[0].run_id = "test-lot8";
    expect(validateBatch(lot).ok).toBe(true);
  });

  it("enveloppe : run_id manquant, fiches vides, lot trop grand", () => {
    expect(validateBatch({ fiches: LOT.fiches })).toMatchObject({ ok: false, status: 400 });
    expect(validateBatch({ run_id: "x", fiches: LOT.fiches })).toMatchObject({ ok: false, status: 400 });
    expect(validateBatch({ run_id: "run-1", fiches: [] })).toMatchObject({ ok: false, status: 400 });
    expect(validateBatch({ run_id: "run-1", entries: LOT.fiches }).ok).toBe(true);
    const big = { run_id: "run-1", fiches: Array.from({ length: 201 }, (_, i) => ({ ...LOT.fiches[0], dedupe_key: `test:big:${String(i).padStart(4, "0")}` })) };
    expect(validateBatch(big)).toMatchObject({ ok: false, status: 413 });
    expect(validateBatch("texte")).toMatchObject({ ok: false, status: 400 });
  });

  it("toRow : correspondance exacte vers les colonnes de la base", () => {
    const v = validateBatch(clone());
    if (!v.ok) throw new Error("lot invalide");
    const row = toRow(v.fiches[0]);
    expect(row).toEqual({
      dedupe_key: "test:lot8:01",
      published_on: "2026-09-02",
      collected_on: "2026-09-21",
      indicator: 23,
      category: "legale",
      title: "TEST — Actualisation du guide de lecture Qualiopi (fiche d'essai)",
      source: "Ministère du Travail — guide de lecture Qualiopi",
      url: "https://travail-emploi.gouv.fr/qualiopi-test-01",
      summary: "Fiche d'essai n° 1 : mise à jour du guide de lecture du référentiel national qualité, indicateurs 23 à 26 précisés.",
      impact: "Relire les preuves de veille attendues avant l'audit de surveillance.",
      exploitation: "Point de 10 minutes en réunion d'équipe, mise à jour du tableau des preuves.",
      alert: true,
    });
  });
});

describe("API de veille — paramètres de lecture", () => {
  it("fields : défaut, liste blanche, inconnus", () => {
    expect(parseFields(null)).toEqual({ ok: true, fields: DEFAULT_ENTRY_FIELDS });
    expect(parseFields("dedupe_key, titre ,url,url")).toEqual({ ok: true, fields: ["dedupe_key", "titre", "url"] });
    expect(parseFields("dedupe_key,mot_de_passe")).toEqual({ ok: false, inconnus: ["mot_de_passe"] });
  });

  it("from : date valide ou 90 jours par défaut", () => {
    expect(parseFromDate("2026-09-01")).toEqual({ ok: true, from: "2026-09-01" });
    expect(parseFromDate("2026-13-01").ok).toBe(false);
    expect(parseFromDate("hier").ok).toBe(false);
    const d = parseFromDate(null);
    expect(d.ok && /^\d{4}-\d{2}-\d{2}$/.test(d.from)).toBe(true);
  });
});

describe("API de veille — notes mensuelles et exécutions", () => {
  it("note mensuelle : alias anglais acceptés, mois strict, contenu obligatoire", () => {
    const ok = monthlyNoteSchema.safeParse(normalizeMonthlyNoteBody({ month: "2026-09", content: "Synthèse du mois", run_id: "veille-2026-W39", entries_count: 8 }));
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ mois: "2026-09", contenu: "Synthèse du mois", nb_fiches: 8 });
    expect(monthlyNoteSchema.safeParse(normalizeMonthlyNoteBody({ mois: "2026-13", contenu: "x" })).success).toBe(false);
    expect(monthlyNoteSchema.safeParse(normalizeMonthlyNoteBody({ mois: "2026-09" })).success).toBe(false);
  });

  it("exécution : statut normalisé, stats numériques seulement, CSV de secours en https", () => {
    const ok = runSchema.safeParse(normalizeRunBody({ run_id: "veille-2026-W39", status: "Succès", started_at: "2026-09-21T06:00:00Z", finished_at: "2026-09-21T06:12:00Z", stats: { sources_consultees: 14, fiches_redigees: 8 }, csv_fallback: { url: "https://exemple.fr/veille.csv", nom: "veille-W39.csv" } }));
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.statut).toBe("succes");
    expect(runSchema.safeParse({ run_id: "veille-2026-W39", statut: "fini" }).success).toBe(false);
    expect(runSchema.safeParse({ run_id: "veille-2026-W39", statut: "succes", stats: { note: "texte" } }).success).toBe(false);
    expect(runSchema.safeParse({ run_id: "veille-2026-W39", statut: "succes", csv_secours: { url: "ftp://x" } }).success).toBe(false);
    expect(runSchema.safeParse({ run_id: "veille-2026-W39", statut: "echec", message: "x".repeat(2001) }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WAITLIST_SHEET_TAB,
  a1,
  explainSheetError,
  parseSpreadsheetId,
  pushWaitlist,
  readWaitlistSheetState,
  sheetValues,
  syncWaitlistSheet,
} from "@/lib/admission/waitlist-sheet";
import { WAITLIST_COLUMNS } from "@/lib/admission/waitlist-export";
import { ORG, fakeClient, learnerRow, world } from "../documents-apprenant/fake-supabase";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-fictif_";

// Faux client Google Sheets : garde les appels, onglets existants au choix, erreur au choix.
function fakeSheets(tabs: string[], fail?: unknown) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const api = {
    spreadsheets: {
      get: async (args: Record<string, unknown>) => {
        calls.push({ op: "get", args });
        if (fail) throw fail;
        return { data: { sheets: tabs.map((title) => ({ properties: { title } })) } };
      },
      batchUpdate: async (args: Record<string, unknown>) => (calls.push({ op: "batchUpdate", args }), { data: {} }),
      values: {
        clear: async (args: Record<string, unknown>) => (calls.push({ op: "clear", args }), { data: {} }),
        update: async (args: Record<string, unknown>) => (calls.push({ op: "update", args }), { data: {} }),
      },
    },
  };
  return { api: api as unknown as Parameters<typeof pushWaitlist>[0], calls };
}

describe("lien et réglage du Google Sheet", () => {
  it("lit l'identifiant depuis le lien de partage, l'identifiant seul ; refuse le reste", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(parseSpreadsheetId(` ${ID} `)).toBe(ID);
    expect(parseSpreadsheetId("https://docs.google.com/document/d/abc/edit")).toBeNull();
    expect(parseSpreadsheetId("")).toBeNull();
  });

  it("état relu des réglages ; rien si aucun Sheet relié", () => {
    expect(readWaitlistSheetState({ waitlist_sheet: { id: ID } })).toEqual({ id: ID, syncedAt: null, rows: null, error: null });
    expect(readWaitlistSheetState({})).toBeNull();
    expect(readWaitlistSheetState(null)).toBeNull();
  });

  it("plage A1 d'un onglet avec apostrophe et espaces", () => {
    expect(a1(WAITLIST_SHEET_TAB, "A1")).toBe("'Liste d''attente (ERP)'!A1");
  });

  it("contenu de l'onglet : titre daté (heure de Paris), ligne vide, en-tête, lignes", () => {
    const v = sheetValues([["1", "A-0001"]], new Date("2026-11-09T06:00:00Z"));
    expect(v[0][0]).toContain("09/11/2026 à 07h00");
    expect(v[0][0]).toContain("1 personne)");
    expect(v[1]).toEqual([]);
    expect(v[2]).toEqual(WAITLIST_COLUMNS);
    expect(v[3]).toEqual(["1", "A-0001"]);
  });

  it("erreurs Google traduites pour l'équipe", () => {
    expect(explainSheetError({ code: 403, message: "The caller does not have permission" }, "erp@x.iam.gserviceaccount.com")).toContain("Éditeur avec erp@x.iam.gserviceaccount.com");
    expect(explainSheetError({ code: 403, message: "Google Sheets API has not been used in project 123" }, null)).toContain("API Google Sheets n'est pas activée");
    expect(explainSheetError({ code: 404, message: "Requested entity was not found." }, null)).toBe("Google Sheet introuvable : vérifiez le lien.");
  });
});

describe("écriture de l'onglet", () => {
  it("crée l'onglet s'il manque, l'efface puis écrit en valeurs brutes (jamais de formule)", async () => {
    const { api, calls } = fakeSheets(["Feuille 1"]);
    await pushWaitlist(api, ID, [["x"]]);
    expect(calls.map((c) => c.op)).toEqual(["get", "batchUpdate", "clear", "update"]);
    expect(calls[2].args.range).toBe("'Liste d''attente (ERP)'!A:Z");
    expect(calls[3].args).toMatchObject({ valueInputOption: "RAW", range: "'Liste d''attente (ERP)'!A1", requestBody: { values: [["x"]] } });
  });

  it("onglet déjà là : ne le recrée pas ; les autres onglets ne sont jamais touchés", async () => {
    const { api, calls } = fakeSheets(["Feuille 1", WAITLIST_SHEET_TAB]);
    await pushWaitlist(api, ID, []);
    expect(calls.map((c) => c.op)).toEqual(["get", "clear", "update"]);
    expect(calls.every((c) => c.op === "get" || String(c.args.range).startsWith("'Liste d''attente (ERP)'"))).toBe(true);
  });
});

describe("mise à jour complète (base simulée)", () => {
  const setup = () => {
    const db = world();
    db.tables.organizations = [{ id: ORG, settings: { whatsapp_templates: { x: "garder" }, waitlist_sheet: { id: ID } } }];
    db.tables.learners = [
      learnerRow({ id: "w1", admission_status: "liste_attente", created_at: "2026-10-02T09:00:00Z", contact_source: null, contact_source_detail: null, prescriber: null, level_assessed: "A1" }),
      learnerRow({ id: "w2", admission_status: "inscrit", created_at: "2026-10-01T09:00:00Z" }),
    ];
    db.tables.learner_contacts = [{ id: "c1", org_id: ORG, learner_id: "w1", contacted_at: "2026-10-20T09:00:00Z", reason: "groupe_complet" }];
    return db;
  };

  it("écrit les seules personnes en liste d'attente et garde la date et le nombre (sans toucher aux autres réglages)", async () => {
    const db = setup();
    const { api, calls } = fakeSheets([]);
    const r = await syncWaitlistSheet(fakeClient(db) as unknown as SupabaseClient, ORG, { now: new Date("2026-11-09T06:00:00Z"), sheets: api });
    expect(r).toEqual({ ok: true, rows: 1 });
    const values = calls.find((c) => c.op === "update")!.args.requestBody as { values: string[][] };
    expect(values.values).toHaveLength(4);
    expect(values.values[3].slice(0, 3)).toEqual(["1", "A-0042", "Prénom"]);
    expect(values.values[3][8]).toBe("Groupe complet");
    const settings = db.tables.organizations[0].settings as Record<string, unknown>;
    expect(settings.waitlist_sheet).toEqual({ id: ID, syncedAt: "2026-11-09T06:00:00.000Z", rows: 1, error: null });
    expect(settings.whatsapp_templates).toEqual({ x: "garder" });
  });

  it("accès refusé par Google : message clair gardé dans les réglages", async () => {
    const db = setup();
    const { api } = fakeSheets([], { code: 403, message: "The caller does not have permission" });
    const r = await syncWaitlistSheet(fakeClient(db) as unknown as SupabaseClient, ORG, { sheets: api });
    expect(r.ok).toBe(false);
    const state = (db.tables.organizations[0].settings as { waitlist_sheet: { error: string } }).waitlist_sheet;
    expect(state.error).toContain("partagez-le en Éditeur");
  });

  it("aucun Sheet relié : rien n'est écrit", async () => {
    const db = setup();
    db.tables.organizations = [{ id: ORG, settings: {} }];
    const { api, calls } = fakeSheets([]);
    expect(await syncWaitlistSheet(fakeClient(db) as unknown as SupabaseClient, ORG, { sheets: api })).toEqual({ ok: false, error: "Aucun Google Sheet relié à la liste d'attente." });
    expect(calls).toHaveLength(0);
  });
});

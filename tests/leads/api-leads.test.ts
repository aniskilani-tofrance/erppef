import { describe, expect, it } from "vitest";
import {
  IMPORT_SOURCE,
  apiImportSchema,
  leadInsertRow,
  normalizeImport,
  phoneKey,
  planImport,
  prospectInsertRow,
  sirenOf,
  type KnownRecord,
} from "@/lib/leads/api-import";
import { parseReadParams } from "@/lib/leads/api-read";
import { ORG_PEF } from "@/lib/leads/api-auth";
import { manualOnlyLead } from "@/lib/leads/templates";

// API Leads (04/11/2026) : import en lot sans doublon, lecture des fiches modifiées.
// Données fictives uniquement.

const TSV = [
  "Restaurant\tContact\tFonction\tTéléphone\tE-mail\tVille\tSecteur\tSource\tCampagne\tStatut\tNotes",
  "Chez Test\tKarim Exemple\tGérant\t+33100000001\t\tPantin 93500\tRestauration\tProspection\tpoei-test\tNouveau\tEnseigne Google : TEST · SIREN 111222333 · Appeler entre 14 h 30 et 17 h 30.",
  "Bistro Fictif\tLéa Modèle\tPrésidente\t01 00 00 00 02\t\tSaint-Denis 93200\tRestauration\tProspection\tpoei-test\tNouveau\tSIREN 444555666",
].join("\n");

const body = (o: Record<string, unknown>) => apiImportSchema.parse(o);

describe("API Leads : lecture du corps d'import", () => {
  it("lit le TSV de l'import par collage, SIREN compris", () => {
    const lines = normalizeImport(body({ cible: "prospection", liste: "Essai", texte: TSV }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ company: "Chez Test", contactName: "Karim Exemple", contactRole: "Gérant", phone: "+33100000001", city: "Pantin", postalCode: "93500", siren: "111222333", campaign: "poei-test", status: "nouveau" });
    expect(lines[1]).toMatchObject({ phone: "+33100000002", siren: "444555666" });
  });

  it("lit les lignes JSON et ajoute le SIREN aux notes", () => {
    const [l] = normalizeImport(body({ campagne: "fle-test", lignes: [{ entreprise: "Transports Fictifs", telephone: "0100000003", siret: "77788899900011", ville: "Bobigny", code_postal: "93000" }] }));
    expect(l).toMatchObject({ company: "Transports Fictifs", phone: "+33100000003", siren: "777888999", siret: "77788899900011", campaign: "fle-test", postalCode: "93000" });
    expect(l.notes).toContain("SIREN 777888999");
  });

  it("refuse un corps ambigu ou incomplet", () => {
    expect(apiImportSchema.safeParse({ texte: TSV, lignes: [{ entreprise: "X" }] }).success).toBe(false);
    expect(apiImportSchema.safeParse({}).success).toBe(false);
    expect(apiImportSchema.safeParse({ cible: "prospection", texte: TSV }).success).toBe(false); // liste manquante
    expect(apiImportSchema.safeParse({ texte: TSV, org_id: "b0000000-0000-4000-8000-000000000002" }).success).toBe(false); // jamais d'organisation dans le corps
    expect(apiImportSchema.safeParse({ lignes: [{ entreprise: "X", source: "formulaire_meta" }] }).success).toBe(false); // jamais de source dans le corps
  });
});

describe("API Leads : dédoublonnage", () => {
  it("SIREN et téléphone : formats variés, même clé", () => {
    expect(sirenOf({ notes: "… · SIREN 111 222 333 · …" })).toBe("111222333");
    expect(sirenOf({ siret: "111 222 333 00011" })).toBe("111222333");
    expect(sirenOf({ notes: "rien" })).toBeNull();
    expect(phoneKey("01 00 00 00 02")).toBe(phoneKey("+33100000002"));
    expect(phoneKey("")).toBeNull();
  });

  it("écarte les fiches déjà connues et les doublons internes au lot", () => {
    const lines = normalizeImport(body({ texte: TSV }));
    const known: KnownRecord[] = [{ id: "x", ref: "L-0007", siren: "111222333", phoneKey: null }];
    const again = [...lines, { ...lines[1], company: "Bistro Fictif bis", siren: null }];
    const plan = planImport(again, known);
    expect(plan.create.map((c) => c.ligne)).toEqual([2]);
    expect(plan.doublons).toEqual([
      { ligne: 1, entreprise: "Chez Test", raison: "siren", existant: "L-0007" },
      { ligne: 3, entreprise: "Bistro Fictif bis", raison: "telephone", existant: "ligne 2" },
    ]);
  });

  it("relancer le même import ne crée rien (idempotent)", () => {
    const lines = normalizeImport(body({ texte: TSV }));
    const first = planImport(lines, []);
    const known = first.create.map((c, i) => ({ id: `id-${i}`, ref: `L-000${i + 1}`, siren: c.line.siren, phoneKey: phoneKey(c.line.phone) }));
    expect(planImport(lines, known).create).toHaveLength(0);
  });

  it("une ligne sans moyen de contact ni SIREN est refusée", () => {
    const plan = planImport([{ ...normalizeImport(body({ texte: TSV }))[0], phone: null, email: null, siren: null }], []);
    expect(plan.erreurs).toEqual([{ ligne: 1, erreur: expect.stringContaining("Ni téléphone") }]);
  });
});

describe("API Leads : fiches écrites", () => {
  const [line] = normalizeImport(body({ texte: TSV }));

  it("lead : source « prospection », donc aucun envoi automatique", () => {
    const row = leadInsertRow(ORG_PEF, line, "setter-1");
    expect(row).toMatchObject({ org_id: ORG_PEF, source: "prospection", campaign: "poei-test", offer: "poei", owner_user_id: "setter-1", status: "nouveau" });
    expect(row).not.toHaveProperty("lead_no"); // attribué par la base (trigger), comme l'import par collage
    expect(IMPORT_SOURCE).toBe("prospection");
    expect(manualOnlyLead(row as { source: string })).toBe(true);
  });

  it("prospect : « À appeler », contact et SIREN gardés en notes", () => {
    const row = prospectInsertRow(ORG_PEF, "liste-1", line);
    expect(row).toMatchObject({ org_id: ORG_PEF, list_id: "liste-1", status: "a_appeler", phone: "+33100000001", department: "93", contact_source: "api" });
    expect(row.notes).toContain("Contact : Karim Exemple (Gérant)");
    expect(sirenOf({ notes: row.notes as string })).toBe("111222333");
  });
});

describe("API Leads : lecture", () => {
  it("« depuis » obligatoire, date ou horodatage", () => {
    expect(parseReadParams(new URLSearchParams("")).ok).toBe(false);
    expect(parseReadParams(new URLSearchParams("depuis=n'importe"))).toMatchObject({ ok: false });
    const r = parseReadParams(new URLSearchParams("depuis=2026-11-04&limite=9999&evenements=1"));
    expect(r).toEqual({ ok: true, value: { cible: "leads", depuis: "2026-11-03T23:00:00.000Z", limite: 500, decalage: 0, evenements: true } });
    expect(parseReadParams(new URLSearchParams("depuis=2026-11-04T10:00:00Z&cible=prospection"))).toMatchObject({ ok: true, value: { cible: "prospection", depuis: "2026-11-04T10:00:00.000Z" } });
    expect(parseReadParams(new URLSearchParams("depuis=2026-11-04&cible=apprenants")).ok).toBe(false);
  });
});
